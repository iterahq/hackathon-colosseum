import { loreView } from './lore.ts';
import { avatarImageUrl, isTransferable, originOf, teraProof, tierName, type AvatarAssetRow, type AvatarCatalog } from './avatars.ts';
import { endorsementsOf } from './endorsement.ts';
import type { Lang } from './art.ts';
import { companionChainImageUrl, companionFromAttributes, companionImageUrl, type CompanionValues } from './companion.ts';
import { cosmeticsOf } from './cosmetics.ts';
import {
  APP_URL,
  CLUSTER,
  explorerUrl,
  imageUrl,
  pickText,
  tierOf,
  type AchievementRow,
  type CatalogEntry,
  type OnchainAttribute,
} from './credential.ts';

export const PROFILE_ASSET_LIMIT = 50;

/** A Core asset as read from chain. */
export interface OnchainAsset {
  address: string;
  name?: string;
  uri?: string;
  owner: string;
  frozen: boolean;
  attributes: OnchainAttribute[];
  collection: string | null;
  /** The update authority of the asset's collection; `null` when the asset has none or it could not be read. */
  update_authority: string | null;
}

export interface ProfileCompanion {
  id: string;
  asset_address: string;
  version: number;
  /** When the asset's attributes were last written; `null` when unknown. */
  mirrored_at: string | null;
  /** The database's values, used only when the asset could not be read. */
  stored: CompanionValues;
}

export interface ProfileInput {
  wallet: string;
  lang: Lang;
  functionsBase: string;
  /** `itera.onchain_config`: the authority and the three collection addresses. */
  config: Record<string, string>;
  /** Minted rows that own an asset (certifications and medals) recorded for this wallet. */
  rows: AchievementRow[];
  catalog: Map<string, CatalogEntry>;
  companion: ProfileCompanion | null;
  onchain: Map<string, OnchainAsset>;
}

/** Valid = the chain says this wallet holds it, in the expected collection of ours, under our authority, frozen. */
export function isVerified(
  asset: OnchainAsset | undefined,
  expected: { wallet: string; collection: string | undefined; authority: string | undefined },
): boolean {
  return (
    asset !== undefined &&
    Boolean(expected.collection) &&
    Boolean(expected.authority) &&
    asset.owner === expected.wallet &&
    asset.collection === expected.collection &&
    asset.update_authority === expected.authority &&
    asset.frozen
  );
}

/**
 * A collectible is valid for a wallet when the chain says that wallet holds it
 * NOW, in our avatars collection, under our authority. It is not frozen, so one
 * that was transferred away stays in our tables and reads `false` here.
 */
export function isCollectibleVerified(
  asset: OnchainAsset | undefined,
  expected: { wallet: string; collection: string | undefined; authority: string | undefined },
): boolean {
  return (
    asset !== undefined &&
    Boolean(expected.collection) &&
    Boolean(expected.authority) &&
    asset.owner === expected.wallet &&
    asset.collection === expected.collection &&
    asset.update_authority === expected.authority
  );
}

/** The `avatars` list of a profile: the collectibles our tables say were minted to this wallet. */
export function profileAvatars(input: {
  wallet: string;
  lang: Lang;
  supabaseUrl: string;
  config: Record<string, string>;
  catalog: AvatarCatalog;
  rows: AvatarAssetRow[];
  onchain: Map<string, OnchainAsset>;
  /** The `earned` block of each earned Tera, by chest id. */
  earned?: ReadonlyMap<string, unknown>;
}) {
  const { wallet, lang, catalog, config } = input;
  return input.rows.flatMap((row) => {
    const item = catalog.items.get(row.item_key);
    if (!item || !row.asset_address) return [];
    const origin = originOf(row);
    const onchain = input.onchain.get(row.asset_address);
    return [
      {
        origin,
        transferable: isTransferable(origin),
        proof: teraProof(row.asset_address),
        ...(origin === 'earned' && row.chest_id && input.earned?.has(row.chest_id) ? { earned: input.earned.get(row.chest_id) } : {}),
        /** What the chain says: an earned Tera is frozen for good, a bought one is not. */
        frozen: onchain?.frozen ?? null,
        key: item.key,
        title: pickText(item.title_i18n, lang),
        lore: loreView(item.key, lang),
        rarity: item.rarity,
        tier_name: tierName(catalog, item, lang),
        serial: row.serial,
        supply_cap: item.supply_cap,
        asset: row.asset_address,
        verified: isCollectibleVerified(input.onchain.get(row.asset_address), { wallet, collection: config.collection_avatars, authority: config.authority }),
        image_url: avatarImageUrl(input.supabaseUrl, item),
        thumb_url: avatarImageUrl(input.supabaseUrl, item, '128'),
        chip_url: avatarImageUrl(input.supabaseUrl, item, 'chip'),
        page_url: `${APP_URL}/c/${row.asset_address}`,
        explorer_url: explorerUrl('address', row.asset_address),
      },
    ];
  });
}

const numberOf = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const langQuery = (lang: Lang, version: string) => `?lang=${lang}&v=${encodeURIComponent(version)}`;

/**
 * The public profile of a wallet. What exists comes from our tables; whether
 * each asset is valid comes from chain. Carries no email, name or itera user id.
 */
export function buildProfile(input: ProfileInput) {
  const { wallet, lang, functionsBase, config, catalog, onchain } = input;
  const authority = config.authority;
  const check = (asset: string, collection: string | undefined) => isVerified(onchain.get(asset), { wallet, collection, authority });
  const owned = input.rows.filter((row) => row.asset_address !== null && catalog.has(row.achievement_key));

  const certifications = owned
    .filter((row) => row.achievement_key === 'trail_pass')
    .map((row) => {
      const asset = row.asset_address as string;
      const { ink, frame } = cosmeticsOf(row.state);
      const daysDone = numberOf(row.state.days_done);
      const endorsed = endorsementsOf(row.state).length;
      return {
        asset,
        verified: check(asset, config.collection_passports),
        trail: pickText(row.state.trail_title, lang),
        trail_title: { pt: pickText(row.state.trail_title, 'pt'), en: pickText(row.state.trail_title, 'en') },
        days_done: daysDone,
        total_days: numberOf(row.state.total_days),
        tier: tierOf(row, catalog.get(row.achievement_key) as CatalogEntry),
        ink,
        frame,
        completed_at: typeof row.state.completed_at === 'string' ? row.state.completed_at : null,
        earned_at: row.earned_at,
        ...(endorsed > 0 ? { endorsements: endorsed } : {}),
        image_url: `${imageUrl(functionsBase, row.id)}${langQuery(lang, `${daysDone}-${ink ?? 'none'}-${frame ?? 'none'}${endorsed > 0 ? `-e${endorsed}` : ''}`)}`,
        page_url: `${APP_URL}/c/${asset}`,
        explorer_url: explorerUrl('address', asset),
      };
    });

  const medals = owned
    .filter((row) => row.achievement_key !== 'trail_pass')
    .map((row) => {
      const asset = row.asset_address as string;
      const entry = catalog.get(row.achievement_key) as CatalogEntry;
      return {
        asset,
        verified: check(asset, config.collection_medals),
        key: row.achievement_key,
        title: pickText(entry.title_i18n, lang),
        tier: tierOf(row, entry),
        earned_at: row.earned_at,
        image_url: `${imageUrl(functionsBase, row.id)}?lang=${lang}`,
        explorer_url: explorerUrl('address', asset),
      };
    });

  let companion = null;
  if (input.companion) {
    const { id, asset_address: asset, version, stored } = input.companion;
    const read = onchain.get(asset);
    const values = read ? companionFromAttributes(read.attributes) : stored;
    companion = {
      asset,
      verified: check(asset, config.collection_companions),
      ...values,
      // Chain values come with art that draws the same values; the database fallback keeps the live art.
      image_url: read
        ? companionChainImageUrl(functionsBase, id, values, lang)
        : `${companionImageUrl(functionsBase, id)}${langQuery(lang, `${version}-${values.outfit ?? 'none'}`)}`,
      mirrored_at: input.companion.mirrored_at,
      explorer_url: explorerUrl('address', asset),
    };
  }

  const verifiedCount = [...certifications, ...medals, ...(companion ? [companion] : [])].filter((entry) => entry.verified).length;
  return {
    wallet,
    cluster: CLUSTER,
    verified_count: verifiedCount,
    companion,
    certifications,
    medals,
    issuer: {
      authority: authority ?? null,
      collections: [config.collection_passports, config.collection_medals, config.collection_companions].filter(Boolean),
    },
  };
}
