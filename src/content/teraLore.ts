import type { Locale } from '@/i18n';
import raw from './teraLore.json';

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

/** The tier each cast member is shown under on /world (the lore file groups them by chapter, not by key). A lore grouping: it is not `shop_items.rarity`. */
const TIER_OF: Record<string, LoreTier> = {
  brand_phoenix_full: 'primordial',
  special_arco_iris: 'mythic', event_space: 'mythic',
  special_dourado: 'legendary', special_prata: 'legendary', special_verde_neon: 'legendary', special_azul_eletrico: 'legendary',
  special_roxo_estelar: 'legendary', special_vermelho_lava: 'legendary', special_preto_cosmico: 'legendary',
  base_guerreiro: 'epic', base_sombrio: 'epic', base_sabedoria: 'epic', base_evoluido: 'epic', event_halloween: 'epic', event_natal: 'epic', event_verao: 'epic',
  base_lider: 'rare', base_mistico: 'rare', base_natural: 'rare', base_livre: 'rare',
  base_focado: 'rare', base_estudioso: 'rare', base_determinado: 'rare', base_disciplinado: 'rare', base_focado_no_objetivo: 'rare',
  base_criativo: 'rare', base_analitico: 'rare',
  color_roxo: 'rare', color_dourado: 'rare', acc_oculos_codificador: 'rare', rarity_comum: 'rare',
  lang_javascript: 'rare', lang_python: 'rare', lang_solidity: 'rare', lang_rust: 'rare', rarity_raro: 'rare',
  base_iniciante: 'common', acc_cyber_chip: 'common', acc_oculos_tech: 'common', acc_capuz_web3: 'common', acc_chain_link: 'common',
  acc_programador: 'common', acc_fogueira: 'common', color_azul: 'common', acc_cibernetico: 'common', acc_capuz_verde: 'common',
  rarity_epico: 'epic',
  rarity_lendario: 'legendary',
};

export const loreTierOf = (key: string): LoreTier => TIER_OF[key] ?? 'free';

export const loreKeysOfTier = (tier: LoreTier): string[] => LORE_KEYS.filter((k) => loreTierOf(k) === tier);
