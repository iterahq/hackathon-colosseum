import type { Locale } from '@/i18n';
import raw from './teraLore.json';

type Bag = { pt?: string; en?: string };
type Lore = typeof raw;

const LORE: Lore = raw;

export type LoreTier = 'free' | 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type EarnEvent = 'lesson' | 'clean_lesson' | 'day' | 'trail' | 'streak' | 'invite' | 'podium';

export const EARN_EVENTS: readonly EarnEvent[] = ['lesson', 'clean_lesson', 'day', 'trail', 'streak', 'invite', 'podium'];
export const LORE_TIERS: readonly LoreTier[] = ['mythic', 'legendary', 'epic', 'rare', 'common', 'free'];

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

/** The tier each cast member is shown under (the lore file groups them by chapter, not by key). */
const TIER_OF: Record<string, LoreTier> = {
  special_arco_iris: 'mythic', event_space: 'mythic', brand_phoenix_full: 'mythic',
  special_dourado: 'legendary', special_prata: 'legendary', special_verde_neon: 'legendary', special_azul_eletrico: 'legendary',
  special_roxo_estelar: 'legendary', special_vermelho_lava: 'legendary', special_preto_cosmico: 'legendary',
  base_guerreiro: 'epic', base_sombrio: 'epic', base_sabedoria: 'epic', base_evoluido: 'epic', event_halloween: 'epic', event_natal: 'epic', event_verao: 'epic',
  base_lider: 'rare', base_mistico: 'rare', base_natural: 'rare', base_livre: 'rare', acc_cyber_chip: 'rare', acc_oculos_tech: 'rare',
  acc_capuz_web3: 'rare', acc_chain_link: 'rare', acc_programador: 'rare', acc_fogueira: 'rare',
  base_iniciante: 'common', base_focado: 'common', base_estudioso: 'common', base_determinado: 'common', base_disciplinado: 'common',
  base_focado_no_objetivo: 'common', base_criativo: 'common', base_analitico: 'common',
};

export const loreTierOf = (key: string): LoreTier => TIER_OF[key] ?? 'free';

export const loreKeysOfTier = (tier: LoreTier): string[] => LORE_KEYS.filter((k) => loreTierOf(k) === tier);
