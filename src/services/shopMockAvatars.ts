/**
 * Avatar shelf of the mock shop: the backend's planned keys, tiers, prices and supply caps, with the
 * two mascot images as placeholder art. Wire shape of `shop-items` (kind `avatar`) and of `companion.avatar`.
 */
type Lang = 'pt' | 'en';
type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'primordial';

interface Tier {
  name: Record<Lang, string>;
  label: Record<Lang, string>;
  cents: number;
  crystals: number | null;
  max: number | null;
}

const TIERS: Record<Rarity, Tier> = {
  common: { name: { pt: 'Tera', en: 'Tera' }, label: { pt: 'Comum', en: 'Common' }, cents: 20, crystals: 150, max: null },
  rare: { name: { pt: 'Super Tera', en: 'Super Tera' }, label: { pt: 'Raro', en: 'Rare' }, cents: 100, crystals: 600, max: 500 },
  epic: { name: { pt: 'Mega Tera', en: 'Mega Tera' }, label: { pt: 'Muito raro', en: 'Epic' }, cents: 1000, crystals: 2500, max: 100 },
  legendary: { name: { pt: 'Tera Lendário', en: 'Legendary Tera' }, label: { pt: 'Lendário', en: 'Legendary' }, cents: 10000, crystals: 10000, max: 25 },
  mythic: { name: { pt: 'Tera Mítico', en: 'Mythic Tera' }, label: { pt: 'Mítico', en: 'Mythic' }, cents: 100000, crystals: 50000, max: 5 },
  primordial: { name: { pt: 'Tera Primordial', en: 'Primordial Tera' }, label: { pt: 'Único', en: 'One of one' }, cents: 500000, crystals: 250000, max: 1 },
};

/** key, rarity, group, minted, pt title, en title */
type Row = readonly [string, Rarity, string, number, string, string];

const PAID: readonly Row[] = [
  ['brand_phoenix_full', 'primordial', 'special', 0, 'Fênix Primordial', 'Primordial Phoenix'],
  ['special_arco_iris', 'mythic', 'special', 5, 'Prisma', 'Prisma'],
  ['event_space', 'mythic', 'event', 2, 'Nebu', 'Nebu'],
  ['base_sabedoria', 'mythic', 'base', 1, 'Alvo', 'Alvo'],
  ['special_preto_cosmico', 'legendary', 'special', 25, 'Nulo', 'Nulo'],
  ['base_guerreiro', 'legendary', 'base', 12, 'Ardo', 'Ardo'],
  ['base_sombrio', 'legendary', 'base', 7, 'Breu', 'Breu'],
  ['base_evoluido', 'legendary', 'base', 3, 'Kaio', 'Kaio'],
  ['event_halloween', 'legendary', 'event', 9, 'Susto', 'Susto'],
  ['event_natal', 'legendary', 'event', 4, 'Pinho', 'Pinho'],
  ['event_verao', 'legendary', 'event', 6, 'Caju', 'Caju'],
  ['special_dourado', 'epic', 'special', 63, 'Sol', 'Sol'],
  ['special_prata', 'epic', 'special', 41, 'Luan', 'Luan'],
  ['special_verde_neon', 'epic', 'special', 18, 'Vigo', 'Vigo'],
  ['special_azul_eletrico', 'epic', 'special', 52, 'Volt', 'Volt'],
  ['special_roxo_estelar', 'epic', 'special', 30, 'Astro', 'Astro'],
  ['base_focado_no_objetivo', 'epic', 'base', 77, 'Ravi', 'Ravi'],
  ['base_mistico', 'epic', 'base', 22, 'Vesper', 'Vesper'],
  ['base_lider', 'rare', 'base', 120, 'Dom', 'Dom'],
  ['base_natural', 'rare', 'base', 88, 'Ipê', 'Ipê'],
  ['base_livre', 'rare', 'base', 203, 'Zeno', 'Zeno'],
  ['base_iniciante', 'common', 'base', 340, 'Pipo', 'Pipo'],
  ['base_focado', 'common', 'base', 211, 'Nilo', 'Nilo'],
  ['base_estudioso', 'common', 'base', 187, 'Tilo', 'Tilo'],
  ['base_criativo', 'common', 'base', 150, 'Zuri', 'Zuri'],
  ['acc_cyber_chip', 'common', 'accessory', 88, 'Tico', 'Tico'],
  ['acc_oculos_tech', 'common', 'accessory', 152, 'Lenz', 'Lenz'],
  ['acc_capuz_web3', 'common', 'accessory', 97, 'Nuno', 'Nuno'],
];

/** Seasonal avatars: out of window they are listed, not buyable. */
const SEASONS: Record<string, { key: string; label: Record<Lang, string>; starts: string; ends: string; available: boolean }> = {
  event_halloween: { key: 'halloween', label: { pt: 'Halloween', en: 'Halloween' }, starts: '2026-10-01', ends: '2026-10-31', available: true },
  event_natal: { key: 'natal', label: { pt: 'Natal', en: 'Christmas' }, starts: '2026-12-01', ends: '2026-12-31', available: false },
  event_verao: { key: 'verao', label: { pt: 'Verão', en: 'Summer' }, starts: '2026-12-21', ends: '2027-03-20', available: false },
};

/** What an avatar brings along (its signature border; Caju also the glasses). */
function includesOf(key: string, rarity: Rarity, title: string, lang: Lang): { key: string; kind: string; title: string }[] {
  if (rarity === 'common' || rarity === 'rare') return [];
  const out = [{ key: `border_${key}`, kind: 'border', title: lang === 'en' ? `${title}'s border` : `borda do ${title}` }];
  if (key === 'event_verao') out.push({ key: 'outfit_glasses', kind: 'outfit', title: lang === 'en' ? 'glasses' : 'óculos' });
  return out;
}

const FREE: readonly (readonly [string, string, string])[] = [
  ['tera_normal', 'Tera', 'Tera'],
  ['tera_feliz', 'Feliz', 'Happy'],
  ['tera_determinado', 'Determinado', 'Determined'],
  ['tera_piscada', 'Piscada', 'Wink'],
  ['tera_surpreso', 'Surpreso', 'Surprised'],
  ['tera_focado', 'Focado', 'Focused'],
  ['tera_triste', 'Triste', 'Sad'],
  ['tera_sorriso', 'Sorriso', 'Smile'],
  ['tera_sob_pressao', 'Sob pressão', 'Under pressure'],
  ['tera_curioso', 'Curioso', 'Curious'],
];

const LAMPORTS_PER_CENT = 55_000;
const ART = 'https://nyzcbnnbffsizshiolbh.supabase.co/storage/v1/object/public/tera-avatars';
const artOf = (key: string) => ({ image_url: `${ART}/${key}.webp`, thumb_url: `${ART}/${key}_128.webp`, chip_url: `${ART}/${key}_chip.webp` });
const solOf = (cents: number) => String((cents * LAMPORTS_PER_CENT) / 1_000_000_000);

export const MOCK_AVATAR_KEYS: readonly string[] = [...PAID.map((r) => r[0]), ...FREE.map((r) => r[0])];
export const isMockAvatar = (key: string): boolean => MOCK_AVATAR_KEYS.includes(key);
export const isFreeMockAvatar = (key: string): boolean => FREE.some((r) => r[0] === key);

export function mockAvatarPrice(key: string): { cents: number; lamports: number; crystals: number | null } {
  const row = PAID.find((r) => r[0] === key);
  const cents = row ? TIERS[row[1]].cents : 0;
  return { cents, lamports: cents * LAMPORTS_PER_CENT, crystals: row ? TIERS[row[1]].crystals : null };
}

interface Holder {
  owned: readonly string[];
  avatar: string;
  asset: string | null;
}

/** The `shop-items` rows of kind `avatar`: paid tiers first, then the free icons. */
export function mockAvatarItems(lang: Lang, holder: Holder): Record<string, unknown>[] {
  const paid = PAID.map(([key, rarity, group, minted, pt, en]) => {
    const tier = TIERS[rarity];
    const owned = holder.owned.includes(key);
    return {
      key,
      kind: 'avatar',
      title: lang === 'en' ? en : pt,
      description: lang === 'en' ? `${tier.name.en} avatar, a collectible NFT.` : `Avatar ${tier.name.pt}, um NFT colecionável.`,
      rarity,
      rarity_label: tier.label[lang],
      tier_name: tier.name[lang],
      group,
      free: false,
      season: SEASONS[key] ? { key: SEASONS[key].key, label: SEASONS[key].label[lang], starts_at: SEASONS[key].starts, ends_at: SEASONS[key].ends, available: SEASONS[key].available } : null,
      includes: includesOf(key, rarity, lang === 'en' ? en : pt, lang),
      price_crystals: tier.crystals,
      allows_outfit: false,
      price_usd_cents: tier.cents,
      price_lamports: tier.cents * LAMPORTS_PER_CENT,
      price_label: `US$ ${(tier.cents / 100).toFixed(2)} ≈ ${solOf(tier.cents)} SOL`,
      ...artOf(key),
      supply: { minted: Math.min(tier.max ?? Infinity, minted + (owned ? 1 : 0)), max: tier.max },
      owned,
      equipped: holder.avatar === key,
      asset_address: owned ? holder.asset : null,
      art: {},
    };
  });
  const free = FREE.map(([key, pt, en]) => ({
    key,
    kind: 'avatar',
    title: lang === 'en' ? en : pt,
    description: lang === 'en' ? 'A free icon. Yours from day one.' : 'Um ícone grátis. Seu desde o primeiro dia.',
    rarity: 'common',
    rarity_label: lang === 'en' ? 'Free' : 'Grátis',
    tier_name: lang === 'en' ? 'Free icons' : 'Ícones grátis',
    group: 'expression',
    free: true,
    season: null,
    includes: [],
    price_crystals: null,
    allows_outfit: true,
    price_usd_cents: 0,
    price_lamports: 0,
    price_label: lang === 'en' ? 'Free' : 'Grátis',
    ...artOf(key),
    supply: { minted: 0, max: null },
    owned: true,
    equipped: holder.avatar === key,
    asset_address: null,
    art: {},
  }));
  return [...paid, ...free];
}

/** The `avatar` block of a `companion` answer. */
export function mockAvatarBlock(lang: Lang, holder: Holder): Record<string, unknown> {
  const row = mockAvatarItems(lang, holder).find((item) => item.key === holder.avatar) ?? mockAvatarItems(lang, holder).find((item) => item.key === 'tera_normal');
  return { key: row?.key, title: row?.title, rarity: row?.rarity, tier_name: row?.tier_name, image_url: row?.image_url, thumb_url: row?.thumb_url, asset_address: row?.asset_address ?? null, allows_outfit: row?.allows_outfit };
}
