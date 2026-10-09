import { isSolanaAddress } from '../_shared/address.ts';
import { readCredential, readOnlyUmi } from '../_shared/chain.ts';
import { COLLECTIONS } from '../_shared/chain-names.ts';
import {
  APP_URL,
  CLUSTER,
  explorerUrl,
  imageUrl,
  metadataUrl,
  pickText,
  tierOf,
  type AchievementRow,
  type CatalogEntry,
} from '../_shared/credential.ts';
import { CATALOG_COLUMNS, ROW_COLUMNS, loadConfig, serviceClient, type IteraClient } from '../_shared/db.ts';
import { corsHeaders, functionsBase, json, langOf, pathAfter } from '../_shared/http.ts';

const ASSET_KEYS = ['trail_pass', 'first_stamp', 'streak_3', 'streak_7', 'program_complete', 'early_bird', 'night_owl'];
const PUBLIC_STATE_FIELDS = [
  'trail_title',
  'program_slug',
  'program_title',
  'days_done',
  'total_days',
  'stamped_days',
  'tier',
  'completed_at',
  'day',
  'lesson_title',
];

function publicState(state: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(PUBLIC_STATE_FIELDS.filter((field) => field in state).map((field) => [field, state[field]]));
}

/** The catalog side of an asset: the row that owns it and, for a passport, its stamps. */
async function loadAchievement(db: IteraClient, assetAddress: string, lang: 'pt' | 'en') {
  const { data: rows, error } = await db
    .from('user_achievements')
    .select(ROW_COLUMNS)
    .eq('asset_address', assetAddress)
    .order('earned_at');
  if (error) throw new Error(`user_achievements: ${error.message}`);
  const all = (rows ?? []) as AchievementRow[];
  const owner = all.find((row) => ASSET_KEYS.includes(row.achievement_key));
  if (!owner) return null;

  const { data: catalog, error: catalogError } = await db
    .from('achievements')
    .select(CATALOG_COLUMNS)
    .eq('key', owner.achievement_key)
    .single();
  if (catalogError) throw new Error(`achievements: ${catalogError.message}`);
  const entry = catalog as CatalogEntry;
  const base = functionsBase();

  return {
    key: owner.achievement_key,
    kind: entry.kind,
    tier: tierOf(owner, entry),
    title: pickText(entry.title_i18n, lang),
    description: pickText(entry.description_i18n, lang),
    trail: 'trail_title' in owner.state ? pickText(owner.state.trail_title, lang) : null,
    credential_id: owner.id,
    earned_at: owner.earned_at,
    minted_at: owner.minted_at,
    state: publicState(owner.state),
    metadata_url: metadataUrl(base, owner.id),
    image_url: imageUrl(base, owner.id),
    stamps: all
      .filter((row) => row.achievement_key === 'day_stamp')
      .map((row) => ({
        day: row.state.day ?? null,
        lesson: pickText(row.state.lesson_title, lang),
        earned_at: row.earned_at,
        tx_signature: row.tx_signature,
        tx_explorer_url: explorerUrl('tx', row.tx_signature),
      })),
  };
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'public');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const [address, ...rest] = pathAfter(request, 'credential-verify');
    if (!isSolanaAddress(address) || rest.length > 0) return json({ error: 'invalid_address' }, 400, cors);

    const db = serviceClient();
    const [onchain, config] = await Promise.all([readCredential(readOnlyUmi(), address), loadConfig(db)]);
    if (!onchain) return json({ verified: false, error: 'asset_not_found', asset: address, cluster: CLUSTER }, 404, cors);

    const ourCollections = Object.values(COLLECTIONS)
      .map(({ configKey }) => config[configKey])
      .filter(Boolean);
    const checks = {
      collection_is_ours: onchain.collection !== null && ourCollections.includes(onchain.collection),
      update_authority_is_ours: Boolean(config.authority) && onchain.update_authority === config.authority,
      soulbound: onchain.frozen,
    };
    const verified = checks.collection_is_ours && checks.update_authority_is_ours;

    // Catalog data is only attached to an asset we issued: an address alone proves nothing.
    const achievement = verified ? await loadAchievement(db, address, langOf(request, 'pt')) : null;
    return json(
      {
        verified,
        checks,
        cluster: CLUSTER,
        asset: onchain.address,
        name: onchain.name,
        uri: onchain.uri,
        owner: onchain.owner,
        frozen: onchain.frozen,
        collection: onchain.collection,
        update_authority: onchain.update_authority,
        attributes: onchain.attributes,
        achievement,
        minted_at: achievement?.minted_at ?? null,
        explorer_url: explorerUrl('address', address),
        owner_explorer_url: explorerUrl('address', onchain.owner),
        issuer: { authority: config.authority ?? null, collections: ourCollections },
        page_url: `${APP_URL}/c/${address}`,
      },
      200,
      { ...cors, 'Cache-Control': 'public, max-age=20' },
    );
  } catch (error) {
    console.error('credential-verify failed', error);
    return json({ error: 'upstream_unavailable' }, 502, cors);
  }
});
