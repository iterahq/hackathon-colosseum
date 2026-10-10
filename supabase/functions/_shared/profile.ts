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
        image_url: `${imageUrl(functionsBase, row.id)}${langQuery(lang, `${daysDone}-${ink ?? 'none'}-${frame ?? 'none'}`)}`,
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
