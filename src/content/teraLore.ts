import type { Locale } from '@/i18n';
import raw from './teraLore.json';
import FALLBACK_TIERS from './teraTiers.json';

type Bag = { pt?: string; en?: string };
type Lore = typeof raw;

const LORE: Lore = raw;

export type LoreTier = 'free' | 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'primordial';
export type EarnEvent = 'lesson' | 'clean_lesson' | 'day' | 'trail' | 'streak' | 'invite' | 'podium';

export const EARN_EVENTS: readonly EarnEvent[] = ['lesson', 'clean_lesson', 'day', 'trail', 'streak', 'invite', 'podium'];
export const LORE_TIERS: readonly LoreTier[] = ['primordial', 'mythic', 'legendary', 'epic', 'rare', 'common', 'free'];

const pick = (bag: Bag | undefined, locale: Locale): string => (bag?.[locale] || bag?.pt || '').trim();

export const LORE_KEYS: readonly string[] = Object.keys(LORE.avatars);

const avatarOf = (key: string) =>
  Object.prototype.hasOwnProperty.call(LORE.avatars, key) ? (LORE.avatars as Record<string, Lore['avatars']['tera_normal']>)[key] : null;

export interface AvatarLore {
  key: string;
  name: string;
  epithet: string;
  story: string;
  quote: string;
  relations: string[];
}

export function loreOf(key: string, locale: Locale): AvatarLore | null {
  const a = avatarOf(key);
  if (!a) return null;
  return {
    key,
    name: pick(a.name, locale),
    epithet: pick(a.epithet, locale),
    story: pick(a.story, locale),
    quote: pick(a.quote, locale),
    relations: [...a.relations],
  };
}

export function loreRelated(key: string, locale: Locale): { key: string; name: string }[] {
  const a = avatarOf(key);
  if (!a) return [];
  return a.relations.flatMap((k) => {
    const rel = avatarOf(k);
    return rel ? [{ key: k, name: pick(rel.name, locale) }] : [];
  });
}

export function WORLD_LORE(locale: Locale) {
  const w = LORE.world;
  return {
    name: pick(w.name, locale),
    tagline: pick(w.tagline, locale),
    text: pick(w.text, locale),
    legend: pick(w.legend, locale),
    places: w.places.map((p) => ({ name: pick(p.name, locale), text: pick(p.text, locale) })),
    rules: w.rules.map((r) => pick(r, locale)),
  };
}

export function TIER_LORE(tier: LoreTier, locale: Locale): { name: string; text: string } {
  const t = LORE.tiers[tier];
  return { name: pick(t?.name, locale), text: pick(t?.text, locale) };
}

export function CRYSTAL_LORE(locale: Locale) {
  const c = LORE.crystal;
  const earn = Object.fromEntries(EARN_EVENTS.map((e) => [e, pick(c.earn[e], locale)])) as Record<EarnEvent, string>;
  return { name: pick(c.name, locale), line: pick(c.line, locale), text: pick(c.text, locale), earn };
}

export type TierMap = Readonly<Record<string, string>>;

const PAID_TIERS: ReadonlySet<string> = new Set(['common', 'rare', 'epic', 'legendary', 'mythic', 'primordial']);

/** The tier a cast member is shown under on /world: its rarity in the catalog (`avatars`, the bundled copy when none is passed). A Tera the catalog does not price is a free mood. */
export const loreTierOf = (key: string, avatars: TierMap = FALLBACK_TIERS.avatars): LoreTier => {
  const rarity = Object.prototype.hasOwnProperty.call(avatars, key) ? avatars[key] : '';
  return PAID_TIERS.has(rarity) ? (rarity as LoreTier) : 'free';
};

export const loreKeysOfTier = (tier: LoreTier, avatars?: TierMap): string[] => LORE_KEYS.filter((k) => loreTierOf(k, avatars) === tier);
