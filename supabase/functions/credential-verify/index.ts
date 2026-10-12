import { isSolanaAddress } from '../_shared/address.ts';
import { loreView } from '../_shared/lore.ts';
import { AVATAR_ASSET_COLUMNS, loadAvatarCatalog, supabaseUrl } from '../_shared/avatar-store.ts';
import { avatarFromAttributes, avatarImageUrl, avatarMetadataUrl, teraProof, tierName, type AvatarAssetRow } from '../_shared/avatars.ts';
import { SPONSOR_TIER_NAME, sponsorImageUrl, sponsorMetadataUrl } from '../_shared/sponsor-tera.ts';
import { bountiesOf, sponsorBlock, sponsorTeraByAsset } from '../_shared/sponsor-tera-store.ts';
import { earnedBlocks } from '../_shared/tera-chest-store.ts';
import { readAssets } from '../_shared/chain-read.ts';
import { COLLECTIONS } from '../_shared/chain-names.ts';
import { companionChainImageUrl, companionFromAttributes, companionMetadataUrl, companionText, type CompanionValues } from '../_shared/companion.ts';
import { loadCompanionSnapshot } from '../_shared/companion-store.ts';
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
import { callerAddress, takeRate, tooMany, type RateLimit } from '../_shared/ratelimit.ts';
import { assetVersion, cachedRead, loadCacheRow, wantsFresh } from '../_shared/read-cache.ts';

const ASSET_KEYS = ['trail_pass', 'first_stamp', 'streak_3', 'streak_7', 'program_complete', 'early_bird', 'night_owl', 'podium_1', 'podium_2', 'podium_3', 'weekly_goal'];
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
  'position',
  'class_title',
  'class_date',
  'week',
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
  // The art gains a seal with each endorsement: the count versions its URL past the one-minute cache.
  const endorsed = owner.achievement_key === 'trail_pass' ? (await loadEndorsements(db, owner.id)).length : 0;

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
    image_url: `${imageUrl(base, owner.id)}${endorsed > 0 ? `?v=e${endorsed}` : ''}`,
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

/** The endorsements confirmed on chain for a certification row, oldest slot first. */
async function loadEndorsements(db: IteraClient, rowId: string) {
  const { data, error } = await db.from('endorsements').select('wallet,tx_signature,created_at,slot').eq('user_achievement_id', rowId).not('tx_signature', 'is', null).order('slot');
  if (error) throw new Error(`endorsements: ${error.message}`);
  return (data ?? []).map((entry) => ({
    wallet: entry.wallet as string,
    at: new Date(entry.created_at as string).toISOString(),
    tx_signature: entry.tx_signature as string,
    explorer_url: explorerUrl('tx', entry.tx_signature as string),
  }));
}

/**
 * The companion behind an asset, in the shape of an achievement. No user id, name or email.
 * Its image draws `onchain`, the values this response reports, not the live row.
 */
async function loadCompanionAchievement(db: IteraClient, assetAddress: string, lang: 'pt' | 'en', onchain: CompanionValues) {
  const snapshot = await loadCompanionSnapshot(db, assetAddress, 'asset_address');
  if (!snapshot) return null;
  const { data, error } = await db.from('companions').select('created_at,minted_at').eq('id', snapshot.id).single();
  if (error) throw new Error(`companions: ${error.message}`);
  const text = companionText(lang);
  const base = functionsBase();
  const achievement = {
    key: 'companion',
    kind: 'companion',
    tier: 'bronze',
    title: text.name,
    description: text.description,
    trail: null,
    credential_id: snapshot.id,
    earned_at: data.created_at,
    minted_at: data.minted_at,
    state: {
      lives: snapshot.lives,
      max_lives: snapshot.maxLives,
      outfit: snapshot.outfit,
      level: snapshot.stats.level,
      xp: snapshot.stats.xp,
      streak: snapshot.stats.streak,
    },
    metadata_url: companionMetadataUrl(base, snapshot.id),
    image_url: companionChainImageUrl(base, snapshot.id, onchain),
    stamps: [],
  };
  return { achievement, mirroredAt: snapshot.mirroredAt };
}

/**
 * The collectible avatar behind an asset, in the shape of an achievement: the
 * catalog entry and the serial, nothing about who bought it. `null` when the
 * asset is not one we minted.
 */
async function loadAvatarAchievement(db: IteraClient, assetAddress: string, lang: 'pt' | 'en') {
  const { data, error } = await db.from('avatar_assets').select(AVATAR_ASSET_COLUMNS).eq('asset_address', assetAddress).maybeSingle();
  if (error) throw new Error(`avatar_assets: ${error.message}`);
  const row = data as AvatarAssetRow | null;
  if (!row) return loadSponsorAchievement(db, assetAddress, lang);
  const catalog = await loadAvatarCatalog(db);
  const item = catalog.items.get(row.item_key);
  if (!item) return null;
  const image = avatarImageUrl(supabaseUrl(), item);
  const tier = tierName(catalog, item, lang);
  return {
    key: 'avatar',
    kind: 'avatar',
    tier: item.rarity,
    title: `${tier} · ${pickText(item.title_i18n, lang)} #${row.serial}`,
    description: pickText(item.description_i18n, lang),
    lore: loreView(item.key, lang),
    trail: null,
    credential_id: row.id,
    earned_at: row.minted_at,
    minted_at: row.minted_at,
    state: { key: item.key, group: item.avatar_group, rarity: item.rarity, tier_name: tier, serial: row.serial, supply_cap: item.supply_cap },
    metadata_url: avatarMetadataUrl(functionsBase(), row.id),
    image_url: image,
    thumb_url: avatarImageUrl(supabaseUrl(), item, '128'),
    chip_url: avatarImageUrl(supabaseUrl(), item, 'chip'),
    stamps: [],
    /** The day chest behind an earned Tera, from our tables; `undefined` for a bought one. */
    earned: row.chest_id ? (await earnedBlocks(db, [row], lang)).get(row.chest_id) : undefined,
  };
}

/** A sponsor Tera in the same shape: the brand, the bounty and the payout that earned it. `null` when the asset is not one. */
async function loadSponsorAchievement(db: IteraClient, assetAddress: string, lang: 'pt' | 'en') {
  const row = await sponsorTeraByAsset(db, assetAddress);
  if (!row) return null;
  const bounty = (await bountiesOf(db, [row])).get(row.bounty_id);
  const image = sponsorImageUrl(functionsBase(), row.id);
  const tier = SPONSOR_TIER_NAME[lang];
  return {
    key: 'avatar',
    kind: 'avatar',
    tier: 'sponsor',
    title: `${row.brand} · ${tier} #${row.edition}`,
    description: pickText(bounty?.title_i18n, lang),
    lore: null,
    trail: null,
    credential_id: row.id,
    earned_at: row.minted_at,
    minted_at: row.minted_at,
    state: { key: row.base, group: 'sponsor', rarity: 'sponsor', tier_name: tier, serial: row.edition, supply_cap: row.edition_size },
    metadata_url: sponsorMetadataUrl(functionsBase(), row.id),
    image_url: image,
    thumb_url: image,
    chip_url: image,
    stamps: [],
    earned: undefined,
    sponsor: sponsorBlock(row, bounty, lang),
  };
}

/**
 * How a Tera was obtained, as its asset says it: `origin` is the attribute
 * written at mint (absent on a bought one), and it can change hands only while
 * the chain does not hold it frozen.
 */
function teraOrigin(attributes: ReadonlyArray<{ key: string; value: string }>, frozen: boolean, address: string) {
  const written = attributes.find(({ key }) => key === 'origin')?.value;
  const origin = written === 'earned' || written === 'sponsor' ? written : 'bought';
  return { origin, transferable: !frozen, proof: teraProof(address) };
}

const RATE: RateLimit = { limit: 120, windowMs: 60_000 };

/** The verification of one asset, read from the chain now. `null` when no Core asset lives at the address. */
async function verify(db: IteraClient, address: string, lang: 'pt' | 'en') {
  const config = await loadConfig(db);
  const ourCollections = Object.values(COLLECTIONS)
    .map(({ configKey }) => config[configKey])
    .filter(Boolean);
  // The chain and the catalog are read together: the row behind a certification or medal costs nothing when the asset is something else.
  const [found, catalogAchievement] = await Promise.all([readAssets([address], ourCollections), loadAchievement(db, address, lang)]);
  const onchain = found.get(address);
  if (!onchain) return null;

  const checks = {
    collection_is_ours: onchain.collection !== null && ourCollections.includes(onchain.collection),
    update_authority_is_ours: Boolean(config.authority) && onchain.update_authority === config.authority,
    soulbound: onchain.frozen,
  };
  const verified = checks.collection_is_ours && checks.update_authority_is_ours;

  // Catalog data is only attached to an asset we issued: an address alone proves nothing.
  const isCompanion = verified && onchain.collection === config[COLLECTIONS.companions.configKey];
  const chainValues = isCompanion ? companionFromAttributes(onchain.attributes) : null;
  const companionRow = chainValues ? await loadCompanionAchievement(db, address, lang, chainValues) : null;
  // A collectible avatar: ours like the rest, but transferable (`checks.soulbound` is false by design).
  const isAvatar = verified && Boolean(config[COLLECTIONS.avatars.configKey]) && onchain.collection === config[COLLECTIONS.avatars.configKey];
  const avatarAchievement = isAvatar ? await loadAvatarAchievement(db, address, lang) : null;
  const avatar = isAvatar ? avatarFromAttributes(onchain.attributes) : null;
  const achievement = !verified ? null : isAvatar ? avatarAchievement : chainValues ? (companionRow?.achievement ?? null) : catalogAchievement;
  // What the chain says about a companion, parsed; `achievement.state` is the database's view.
  // Teacher endorsements of a certification: wallets and transactions only, never a name or a note.
  const endorsements = achievement && achievement.key === 'trail_pass' ? await loadEndorsements(db, achievement.credential_id) : undefined;
  const companion = chainValues
    ? { ...chainValues, image_url: achievement?.image_url ?? null, metadata_url: achievement?.metadata_url ?? null }
    : undefined;
  return {
    verified,
    checks,
    cluster: CLUSTER,
    asset: onchain.address,
    name: onchain.name ?? '',
    uri: onchain.uri ?? '',
    owner: onchain.owner,
    frozen: onchain.frozen,
    collection: onchain.collection,
    update_authority: onchain.update_authority,
    attributes: onchain.attributes,
    achievement,
    ...(endorsements ? { endorsements } : {}),
    ...(avatar ? { avatar: { ...avatar, lore: loreView(avatar.key, lang), ...teraOrigin(onchain.attributes, onchain.frozen, address), ...(avatarAchievement?.earned ? { earned: avatarAchievement.earned } : {}), ...(avatarAchievement && 'sponsor' in avatarAchievement && avatarAchievement.sponsor ? { sponsor: avatarAchievement.sponsor } : {}) }, image_url: avatarAchievement?.image_url ?? null, chip_url: avatarAchievement?.chip_url ?? null } : {}),
    ...(companion ? { companion, snapshot: { source: 'chain', mirrored_at: companionRow?.mirroredAt ?? null } } : {}),
    minted_at: achievement?.minted_at ?? null,
    explorer_url: explorerUrl('address', address),
    owner_explorer_url: explorerUrl('address', onchain.owner),
    issuer: { authority: config.authority ?? null, collections: ourCollections },
    page_url: `${APP_URL}/c/${address}`,
  };
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'public');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);
  const started = Date.now();

  try {
    const [address, ...rest] = pathAfter(request, 'credential-verify');
    if (!isSolanaAddress(address) || rest.length > 0) return json({ error: 'invalid_address' }, 400, cors);
    const lang = langOf(request, 'pt');
    const fresh = wantsFresh(request);
    const key = `credential-verify:${address}:${lang}`;

    const db = serviceClient();
    // The limit, the database's version of the wallet and the cached row are asked for together.
    const [verdict, version, row] = await Promise.all([takeRate(db, 'credential-verify', callerAddress(request), RATE), assetVersion(db, address), loadCacheRow(db, key)]);
    if (!verdict.allowed) return tooMany(verdict, cors);

    const { body, read } = await cachedRead(db, { key, version, fresh, row }, () => verify(db, address, lang));
    if (!body) return json({ verified: false, error: 'asset_not_found', asset: address, cluster: CLUSTER }, 404, cors);
    return json({ ...body, read }, 200, {
      ...cors,
      'Cache-Control': fresh ? 'no-store' : 'public, max-age=20',
      'Server-Timing': `${read.source};dur=${read.ms}, edge;dur=${Date.now() - started}`,
    });
  } catch (error) {
    console.error('credential-verify failed', error);
    return json({ error: 'upstream_unavailable' }, 502, cors);
  }
});
