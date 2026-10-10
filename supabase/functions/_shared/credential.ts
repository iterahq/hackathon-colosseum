import type { ArtInput, Lang } from './art.ts';
import type { I18nText, Tier } from './awards.ts';
import { cosmeticsOf } from './cosmetics.ts';

export const APP_URL = 'https://hackathon-colosseum.178-105-2-230.sslip.io';
export const CLUSTER = 'devnet';

export interface CatalogEntry {
  key: string;
  kind: 'day' | 'trail' | 'streak' | 'milestone';
  tier: Tier;
  title_i18n: I18nText;
  description_i18n: I18nText;
  art: Record<string, unknown>;
}

export interface AchievementRow {
  id: string;
  user_id: string;
  achievement_key: string;
  ref_id: string;
  state: Record<string, unknown>;
  earned_at: string;
  mint_status: 'unclaimed' | 'pending' | 'minted' | 'failed';
  wallet_address: string | null;
  asset_address: string | null;
  tx_signature: string | null;
  minted_at: string | null;
}

export interface OnchainAttribute {
  key: string;
  value: string;
}

const PASSPORT_KEYS = new Set(['trail_pass', 'day_stamp', 'trail_complete']);
const TIERS: Tier[] = ['bronze', 'silver', 'gold'];

export function pickText(text: unknown, lang: Lang): string {
  if (!text || typeof text !== 'object') return '';
  const record = text as Record<string, unknown>;
  const value = record[lang] ?? record.en ?? record.pt ?? Object.values(record)[0];
  return typeof value === 'string' ? value : '';
}

export function isPassportKey(key: string): boolean {
  return PASSPORT_KEYS.has(key);
}

export function tierOf(row: AchievementRow, catalog: CatalogEntry): Tier {
  const tier = row.state.tier;
  return TIERS.includes(tier as Tier) ? (tier as Tier) : catalog.tier;
}

export function metadataUrl(functionsBase: string, rowId: string): string {
  return `${functionsBase}/credential-meta/${rowId}`;
}

export function imageUrl(functionsBase: string, rowId: string): string {
  return `${functionsBase}/credential-meta/${rowId}/image.svg`;
}

export function explorerUrl(type: 'address' | 'tx', value: string | null): string | null {
  return value ? `https://explorer.solana.com/${type}/${value}?cluster=${CLUSTER}` : null;
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

function numberOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** The on-chain asset name: short, English, stable for the life of the asset. */
export function assetName(row: AchievementRow, catalog: CatalogEntry): string {
  if (row.achievement_key === 'trail_pass') {
    return clip(`Tera Certification · ${pickText(row.state.trail_title, 'en')}`, 60);
  }
  return clip(`Itera Medal · ${pickText(catalog.title_i18n, 'en')}`, 60);
}

/** What the Attributes plugin of the asset should hold for this row right now. */
export function onchainAttributes(row: AchievementRow, catalog: CatalogEntry): OnchainAttribute[] {
  if (row.achievement_key === 'trail_pass') {
    const { ink, frame } = cosmeticsOf(row.state);
    return [
      { key: 'kind', value: 'trail_passport' },
      { key: 'program', value: String(row.state.program_slug ?? '') },
      { key: 'trail', value: clip(pickText(row.state.trail_title, 'en'), 80) },
      { key: 'days_done', value: String(numberOf(row.state.days_done)) },
      { key: 'total_days', value: String(numberOf(row.state.total_days)) },
      { key: 'tier', value: tierOf(row, catalog) },
      { key: 'completed_at', value: typeof row.state.completed_at === 'string' ? row.state.completed_at : '' },
      { key: 'learner', value: row.user_id },
      ...(ink ? [{ key: 'ink', value: ink }] : []),
      ...(frame ? [{ key: 'frame', value: frame }] : []),
    ];
  }
  return [
    { key: 'kind', value: `${catalog.kind}_medal` },
    { key: 'achievement', value: row.achievement_key },
    { key: 'program', value: String(row.state.program_slug ?? '') },
    { key: 'tier', value: tierOf(row, catalog) },
    { key: 'completed_at', value: row.earned_at },
    { key: 'learner', value: row.user_id },
  ];
}

/** One confirmed write of an asset's Attributes plugin. */
export interface ChainWrite {
  asset: string;
  signature: string;
  at: string;
  attributes: OnchainAttribute[];
  /** The attributes this write changed, compared with the last ones written. */
  changed: OnchainAttribute[];
}

export function changedAttributes(previous: OnchainAttribute[] | null, next: OnchainAttribute[]): OnchainAttribute[] {
  const before = new Map((previous ?? []).map(({ key, value }) => [key, value]));
  return next.filter(({ key, value }) => key !== 'learner' && before.get(key) !== value);
}

/** The optional `chain` block of a response. `lives` only when the asset carries that attribute. */
export function chainBlock(write: ChainWrite) {
  const lives = Number.parseInt(write.attributes.find(({ key }) => key === 'lives')?.value ?? '', 10);
  return {
    tx_signature: write.signature,
    explorer_url: explorerUrl('tx', write.signature),
    ...(Number.isInteger(lives) ? { lives } : {}),
    mirrored_at: write.at,
  };
}

/** Machine-readable summary of a write: one entry per attribute that changed. */
export function writtenList(write: ChainWrite): Array<{ asset: string; attribute: string; value: string }> {
  return write.changed.map(({ key, value }) => ({ asset: write.asset, attribute: key, value }));
}

/**
 * `passport` is the trail_pass row a stamp or a completion belongs to: their
 * artwork is the passport page itself, so it always shows the current stamps.
 */
export function artInput(row: AchievementRow, catalog: CatalogEntry, lang: Lang, passport: AchievementRow | null): ArtInput {
  const page = row.achievement_key === 'trail_pass' ? row : passport;
  const serial = row.id.replace(/-/g, '').slice(0, 8).toUpperCase();
  if (isPassportKey(row.achievement_key) && page) {
    const stampedDays = Array.isArray(page.state.stamped_days) ? page.state.stamped_days.filter((day) => typeof day === 'number') : [];
    return {
      shape: 'passport',
      tier: page.state.tier === 'gold' ? 'gold' : 'bronze',
      title: pickText(catalog.title_i18n, lang),
      subtitle: pickText(page.state.trail_title, lang),
      daysDone: numberOf(page.state.days_done),
      totalDays: numberOf(page.state.total_days),
      stampedDays,
      highlightDay: row.achievement_key === 'day_stamp' ? numberOf(row.state.day) || null : null,
      glyph: '',
      accent: null,
      programSlug: String(page.state.program_slug ?? ''),
      serial,
      lang,
      ...cosmeticsOf(page.state),
    };
  }
  return {
    shape: 'medal',
    tier: tierOf(row, catalog),
    title: pickText(catalog.title_i18n, lang),
    subtitle: pickText(catalog.description_i18n, lang),
    daysDone: 0,
    totalDays: 0,
    stampedDays: [],
    highlightDay: null,
    glyph: typeof catalog.art.glyph === 'string' ? catalog.art.glyph : '★',
    accent: typeof catalog.art.accent === 'string' ? catalog.art.accent : null,
    programSlug: String(row.state.program_slug ?? ''),
    serial,
    lang,
  };
}

/** Metaplex-standard JSON. Carries the achievement, the trail and the asset: no personal data. */
export function buildMetadata(
  row: AchievementRow,
  catalog: CatalogEntry,
  lang: Lang,
  functionsBase: string,
  passport: AchievementRow | null,
) {
  const page = row.achievement_key === 'trail_pass' ? row : passport;
  const trail = page ? pickText(page.state.trail_title, lang) : '';
  const title = pickText(catalog.title_i18n, lang);
  const image = `${imageUrl(functionsBase, row.id)}${lang === 'en' ? '' : `?lang=${lang}`}`;
  const attributes: Array<{ trait_type: string; value: string | number }> = [
    { trait_type: 'Achievement', value: row.achievement_key },
    { trait_type: 'Kind', value: catalog.kind },
    { trait_type: 'Tier', value: page ? (page.state.tier === 'gold' ? 'gold' : 'bronze') : tierOf(row, catalog) },
    { trait_type: 'Earned at', value: row.earned_at },
  ];
  if (page) {
    attributes.push(
      { trait_type: 'Trail', value: trail },
      { trait_type: 'Program', value: String(page.state.program_slug ?? '') },
      { trait_type: 'Days done', value: numberOf(page.state.days_done) },
      { trait_type: 'Total days', value: numberOf(page.state.total_days) },
    );
  }
  if (row.achievement_key === 'day_stamp') attributes.push({ trait_type: 'Day', value: numberOf(row.state.day) });
  const cosmetics = page ? cosmeticsOf(page.state) : null;
  if (cosmetics?.ink) attributes.push({ trait_type: 'Ink', value: cosmetics.ink });
  if (cosmetics?.frame) attributes.push({ trait_type: 'Frame', value: cosmetics.frame });

  return {
    name: trail && isPassportKey(row.achievement_key) ? clip(`${title} · ${trail}`, 80) : title,
    symbol: 'ITERA',
    description: pickText(catalog.description_i18n, lang),
    image,
    external_url: `${APP_URL}/c/${row.asset_address ?? row.id}`,
    attributes,
    properties: { category: 'image', files: [{ uri: image, type: 'image/svg+xml' }] },
  };
}

/** One entry of `passport`'s `awards` / `updated`, as the app consumes it. */
export function awardView(row: AchievementRow, catalog: CatalogEntry, lang: Lang, functionsBase: string) {
  return {
    id: row.id,
    key: row.achievement_key,
    kind: catalog.kind,
    tier: tierOf(row, catalog),
    title: pickText(catalog.title_i18n, lang),
    description: pickText(catalog.description_i18n, lang),
    ref_id: row.ref_id,
    state: 'trail_title' in row.state ? { ...row.state, trail: pickText(row.state.trail_title, lang) } : row.state,
    earned_at: row.earned_at,
    mint_status: row.mint_status,
    asset_address: row.asset_address,
    tx_signature: row.tx_signature,
    explorer_url: explorerUrl('address', row.asset_address),
    tx_explorer_url: explorerUrl('tx', row.tx_signature),
    metadata_url: metadataUrl(functionsBase, row.id),
    image_url: imageUrl(functionsBase, row.id),
  };
}
