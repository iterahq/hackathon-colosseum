import { renderArt, type CompanionAvatarArt } from '../_shared/art.ts';
import { companionAvatarArt } from '../_shared/avatar-image.ts';
import { AVATAR_ASSET_COLUMNS, loadAvatarCatalog, supabaseUrl } from '../_shared/avatar-store.ts';
import { avatarMetadata, type AvatarAssetRow } from '../_shared/avatars.ts';
import { parsePreview, previewArtInput } from '../_shared/preview.ts';
import { COLLECTIONS, type CollectionKind } from '../_shared/chain-names.ts';
import { companionArtInput, companionFromAttributes, companionMetadata, withChainValues, type CompanionSnapshot } from '../_shared/companion.ts';
import { loadCompanionSnapshot } from '../_shared/companion-store.ts';
import { restoreCosmetics } from '../_shared/cosmetics-store.ts';
import { APP_URL, artInput, buildMetadata, type AchievementRow, type CatalogEntry } from '../_shared/credential.ts';
import { CATALOG_COLUMNS, ROW_COLUMNS, serviceClient, type IteraClient } from '../_shared/db.ts';
import { corsHeaders, functionsBase, isUuid, json, langOf, pathAfter } from '../_shared/http.ts';

const CACHE = 'public, max-age=60';
const PREVIEW_CACHE = 'public, max-age=300';

interface Credential {
  row: AchievementRow;
  catalog: CatalogEntry;
  passport: AchievementRow | null;
}

async function loadCredential(db: IteraClient, rowId: string): Promise<Credential | null> {
  const { data: row, error } = await db.from('user_achievements').select(ROW_COLUMNS).eq('id', rowId).maybeSingle();
  if (error) throw new Error(`user_achievements: ${error.message}`);
  if (!row) return null;
  const [credential] = await restoreCosmetics(db, [row as AchievementRow]);

  const { data: catalog, error: catalogError } = await db
    .from('achievements')
    .select(CATALOG_COLUMNS)
    .eq('key', credential.achievement_key)
    .single();
  if (catalogError) throw new Error(`achievements: ${catalogError.message}`);

  let passport: AchievementRow | null = null;
  const unitId = credential.achievement_key === 'trail_complete' ? credential.ref_id : credential.state.unit_id;
  if (credential.achievement_key !== 'trail_pass' && typeof unitId === 'string' && isUuid(unitId)) {
    const { data: parent, error: parentError } = await db
      .from('user_achievements')
      .select(ROW_COLUMNS)
      .eq('user_id', credential.user_id)
      .eq('achievement_key', 'trail_pass')
      .eq('ref_id', unitId)
      .maybeSingle();
    if (parentError) throw new Error(`user_achievements parent: ${parentError.message}`);
    passport = parent ? (await restoreCosmetics(db, [parent as AchievementRow]))[0] : null;
  }
  return { row: credential, catalog: catalog as CatalogEntry, passport };
}

/**
 * The companion as its asset says it, for the public views that report chain
 * values. Falls back to the last mirrored attributes, then to the row itself.
 */
async function chainSnapshot(snapshot: CompanionSnapshot): Promise<CompanionSnapshot> {
  let attributes = snapshot.mirrored;
  if (snapshot.assetAddress) {
    try {
      const { readAssets } = await import('../_shared/chain-read.ts');
      attributes = (await readAssets([snapshot.assetAddress], [])).get(snapshot.assetAddress)?.attributes ?? attributes;
    } catch (error) {
      console.error('companion art: chain read failed', error instanceof Error ? error.message : error);
    }
  }
  return attributes ? withChainValues(snapshot, companionFromAttributes(attributes)) : snapshot;
}

const COLLECTION_TEXT: Record<CollectionKind, string> = {
  passports: "Tera's Certifications: one soulbound page per learner and trail, stamped by Tera for every completed day.",
  medals: 'Soulbound medals for learning milestones at Itera.',
  companions: 'Tera, the soulbound study companion: lives, level and outfit mirror the learning at Itera.',
  avatars: 'Collectible Tera avatars: profile pictures in a rarity pyramid, numbered and transferable (not soulbound).',
};

function isCollectionKind(value: string | undefined): value is CollectionKind {
  return value !== undefined && Object.hasOwn(COLLECTIONS, value);
}

function collectionMetadata(kind: CollectionKind) {
  return {
    name: COLLECTIONS[kind].name,
    symbol: 'ITERA',
    description: COLLECTION_TEXT[kind],
    image: `${functionsBase()}/credential-meta/collection/${kind}/image.svg`,
    external_url: APP_URL,
  };
}

function collectionImage(kind: CollectionKind): string {
  return renderArt({
    shape: kind === 'passports' ? 'passport' : kind === 'medals' ? 'medal' : 'companion',
    tier: kind === 'medals' ? 'gold' : 'bronze',
    title: COLLECTIONS[kind].name,
    subtitle: kind === 'passports' ? COLLECTIONS[kind].name : COLLECTION_TEXT[kind],
    daysDone: 3,
    totalDays: 5,
    stampedDays: [1, 2, 3],
    highlightDay: null,
    glyph: '★',
    accent: '#3FD17F',
    programSlug: 'itera',
    serial: 'COLLECTION',
    lang: 'en',
    companion: { lives: 5, maxLives: 5, level: 1, outfit: null },
  });
}

/** The picture a companion card draws for an avatar key. Never throws: no picture means the built-in Tera. */
async function avatarArt(db: IteraClient, key: string | null | undefined): Promise<CompanionAvatarArt | null> {
  try {
    return await companionAvatarArt(await loadAvatarCatalog(db), key, supabaseUrl());
  } catch (error) {
    console.error('companion art: avatar unavailable', error instanceof Error ? error.message : error);
    return null;
  }
}

function svg(body: string, cors: Record<string, string>, cache = CACHE): Response {
  return new Response(body, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
    },
  });
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'public');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const [first, second, third, ...rest] = pathAfter(request, 'credential-meta');
    const cached = { ...cors, 'Cache-Control': CACHE };

    if (first === 'collection') {
      if (!isCollectionKind(second) || rest.length > 0) return json({ error: 'not_found' }, 404, cors);
      if (third === undefined) return json(collectionMetadata(second), 200, cached);
      return third === 'image.svg' ? svg(collectionImage(second), cors) : json({ error: 'not_found' }, 404, cors);
    }

    // "Try before you buy": the same art as the real endpoints, from the query alone. No user data, no write.
    if (first === 'preview.svg') {
      if (second !== undefined) return json({ error: 'not_found' }, 404, cors);
      const db = serviceClient();
      let keys = new Set<string>();
      try {
        keys = new Set([...(await loadAvatarCatalog(db)).items.values()].filter((item) => item.active).map((item) => item.key));
      } catch (error) {
        console.error('preview: avatar catalog unavailable', error instanceof Error ? error.message : error);
      }
      const preview = parsePreview(new URL(request.url).searchParams, keys);
      if (!preview) return json({ error: 'invalid_type' }, 400, cors);
      const avatar = preview.type === 'companion' ? await avatarArt(db, preview.avatar) : null;
      return svg(renderArt(previewArtInput(preview, avatar)), cors, PREVIEW_CACHE);
    }

    // A minted collectible avatar, keyed by its row id: catalog entry and serial, nothing about the owner.
    if (first === 'avatar') {
      if (!second || !isUuid(second) || third !== undefined) return json({ error: 'not_found' }, 404, cors);
      const db = serviceClient();
      const { data, error } = await db.from('avatar_assets').select(AVATAR_ASSET_COLUMNS).eq('id', second).neq('mint_status', 'reserved').maybeSingle();
      if (error) throw new Error(`avatar_assets: ${error.message}`);
      const catalog = await loadAvatarCatalog(db);
      const item = data ? catalog.items.get((data as AvatarAssetRow).item_key) : undefined;
      if (!data || !item) return json({ error: 'not_found' }, 404, cors);
      return json(avatarMetadata(catalog, item, data as AvatarAssetRow, langOf(request, 'en'), supabaseUrl()), 200, cached);
    }

    if (first === 'companion') {
      const wantsCompanionImage = third === 'image.svg';
      if (!second || !isUuid(second) || rest.length > 0 || (third !== undefined && !wantsCompanionImage)) {
        return json({ error: 'not_found' }, 404, cors);
      }
      const companionDb = serviceClient();
      const snapshot = await loadCompanionSnapshot(companionDb, second);
      if (!snapshot) return json({ error: 'not_found' }, 404, cors);
      const companionLang = langOf(request, 'en');
      if (wantsCompanionImage) {
        const fromChain = new URL(request.url).searchParams.get('source') === 'chain';
        const drawn = fromChain ? await chainSnapshot(snapshot) : snapshot;
        return svg(renderArt(companionArtInput(drawn, companionLang, await avatarArt(companionDb, drawn.avatar))), cors);
      }
      return json(companionMetadata(snapshot, companionLang, functionsBase()), 200, cached);
    }

    const wantsImage = second === 'image.svg';
    if (!first || !isUuid(first) || third !== undefined || (second !== undefined && !wantsImage)) {
      return json({ error: 'not_found' }, 404, cors);
    }
    const credential = await loadCredential(serviceClient(), first);
    if (!credential) return json({ error: 'not_found' }, 404, cors);

    const lang = langOf(request, 'en');
    const { row, catalog, passport } = credential;
    if (wantsImage) return svg(renderArt(artInput(row, catalog, lang, passport)), cors);
    return json(buildMetadata(row, catalog, lang, functionsBase(), passport), 200, cached);
  } catch (error) {
    console.error('credential-meta failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
