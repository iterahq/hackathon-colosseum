import { renderArt } from '../_shared/art.ts';
import { COLLECTIONS, type CollectionKind } from '../_shared/chain-names.ts';
import { APP_URL, artInput, buildMetadata, type AchievementRow, type CatalogEntry } from '../_shared/credential.ts';
import { CATALOG_COLUMNS, ROW_COLUMNS, serviceClient, type IteraClient } from '../_shared/db.ts';
import { corsHeaders, functionsBase, isUuid, json, langOf, pathAfter } from '../_shared/http.ts';

const CACHE = 'public, max-age=60';

interface Credential {
  row: AchievementRow;
  catalog: CatalogEntry;
  passport: AchievementRow | null;
}

async function loadCredential(db: IteraClient, rowId: string): Promise<Credential | null> {
  const { data: row, error } = await db.from('user_achievements').select(ROW_COLUMNS).eq('id', rowId).maybeSingle();
  if (error) throw new Error(`user_achievements: ${error.message}`);
  if (!row) return null;
  const credential = row as AchievementRow;

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
    passport = parent as AchievementRow | null;
  }
  return { row: credential, catalog: catalog as CatalogEntry, passport };
}

function collectionMetadata(kind: CollectionKind) {
  const isPassports = kind === 'passports';
  return {
    name: COLLECTIONS[kind].name,
    symbol: 'ITERA',
    description: isPassports
      ? "Tera's Passport: one soulbound page per learner and trail, stamped by Tera for every completed day."
      : 'Soulbound medals for learning milestones at Itera.',
    image: `${functionsBase()}/credential-meta/collection/${kind}/image.svg`,
    external_url: APP_URL,
  };
}

function collectionImage(kind: CollectionKind): string {
  const isPassports = kind === 'passports';
  return renderArt({
    shape: isPassports ? 'passport' : 'medal',
    tier: isPassports ? 'bronze' : 'gold',
    title: COLLECTIONS[kind].name,
    subtitle: isPassports ? 'Itera Passports' : 'Soulbound medals for learning milestones.',
    colorSeed: kind,
    daysDone: 3,
    totalDays: 5,
    stampedDays: [1, 2, 3],
    highlightDay: null,
    glyph: '★',
    accent: '#3FD17F',
    programSlug: 'itera',
    serial: 'COLLECTION',
    lang: 'en',
  });
}

function svg(body: string, cors: Record<string, string>): Response {
  return new Response(body, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': CACHE,
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
      if ((second !== 'passports' && second !== 'medals') || rest.length > 0) return json({ error: 'not_found' }, 404, cors);
      if (third === undefined) return json(collectionMetadata(second), 200, cached);
      return third === 'image.svg' ? svg(collectionImage(second), cors) : json({ error: 'not_found' }, 404, cors);
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
