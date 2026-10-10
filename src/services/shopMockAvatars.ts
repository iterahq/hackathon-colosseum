/**
 * Avatar shelf of the mock shop: the backend's planned keys, tiers, prices and supply caps, with the
 * two mascot images as placeholder art. Wire shape of `shop-items` (kind `avatar`) and of `companion.avatar`.
 */
type Lang = 'pt' | 'en';
type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

interface Tier {
  name: Record<Lang, string>;
  label: Record<Lang, string>;
  cents: number;
  max: number | null;
}

const TIERS: Record<Rarity, Tier> = {
  common: { name: { pt: 'Tera', en: 'Tera' }, label: { pt: 'Comum', en: 'Common' }, cents: 20, max: null },
  rare: { name: { pt: 'Super Tera', en: 'Super Tera' }, label: { pt: 'Raro', en: 'Rare' }, cents: 50, max: 500 },
  epic: { name: { pt: 'Mega Tera', en: 'Mega Tera' }, label: { pt: 'Muito raro', en: 'Very rare' }, cents: 100, max: 100 },
  legendary: { name: { pt: 'Tera Lendário', en: 'Legendary Tera' }, label: { pt: 'Lendário', en: 'Legendary' }, cents: 300, max: 25 },
  mythic: { name: { pt: 'Tera Mítico', en: 'Mythic Tera' }, label: { pt: 'Mítico', en: 'Mythic' }, cents: 1000, max: 5 },
};

/** key, rarity, group, minted, pt title, en title */
type Row = readonly [string, Rarity, string, number, string, string];

const PAID: readonly Row[] = [
  ['special_arco_iris', 'mythic', 'special', 5, 'Tera Arco-íris', 'Rainbow Tera'],
  ['event_space', 'mythic', 'event', 2, 'Tera Espacial', 'Space Tera'],
  ['special_dourado', 'legendary', 'special', 12, 'Tera Dourado', 'Golden Tera'],
  ['special_verde_neon', 'legendary', 'special', 7, 'Tera Verde Neon', 'Neon Green Tera'],
  ['special_preto_cosmico', 'legendary', 'special', 25, 'Tera Preto Cósmico', 'Cosmic Black Tera'],
  ['base_guerreiro', 'epic', 'base', 41, 'Tera Guerreiro', 'Warrior Tera'],
  ['base_sabedoria', 'epic', 'base', 18, 'Tera Sabedoria', 'Wisdom Tera'],
  ['event_halloween', 'epic', 'event', 63, 'Tera Halloween', 'Halloween Tera'],
  ['base_lider', 'rare', 'base', 120, 'Tera Líder', 'Leader Tera'],
  ['acc_cyber_chip', 'rare', 'accessory', 88, 'Cyber-chip', 'Cyber chip'],
  ['acc_oculos_tech', 'rare', 'accessory', 152, 'Óculos tech', 'Tech glasses'],
  ['acc_capuz_web3', 'rare', 'accessory', 97, 'Capuz web3', 'Web3 hoodie'],
  ['acc_chain_link', 'rare', 'accessory', 64, 'Chain-link', 'Chain link'],
  ['acc_programador', 'rare', 'accessory', 203, 'Máscara de programador', 'Programmer mask'],
  ['base_iniciante', 'common', 'base', 340, 'Tera Iniciante', 'Beginner Tera'],
  ['base_estudioso', 'common', 'base', 211, 'Tera Estudioso', 'Studious Tera'],
  ['base_criativo', 'common', 'base', 187, 'Tera Criativo', 'Creative Tera'],
];

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
const HAPPY = '/mascot/tera-happy.webp';
const NEUTRAL = '/mascot/tera-neutral.webp';
const imageOf = (index: number) => (index % 2 === 0 ? HAPPY : NEUTRAL);
const solOf = (cents: number) => String((cents * LAMPORTS_PER_CENT) / 1_000_000_000);

export const MOCK_AVATAR_KEYS: readonly string[] = [...PAID.map((r) => r[0]), ...FREE.map((r) => r[0])];
export const isMockAvatar = (key: string): boolean => MOCK_AVATAR_KEYS.includes(key);
export const isFreeMockAvatar = (key: string): boolean => FREE.some((r) => r[0] === key);

export function mockAvatarPrice(key: string): { cents: number; lamports: number } {
  const row = PAID.find((r) => r[0] === key);
  const cents = row ? TIERS[row[1]].cents : 0;
  return { cents, lamports: cents * LAMPORTS_PER_CENT };
}

interface Holder {
  owned: readonly string[];
  avatar: string;
  asset: string | null;
}

/** The `shop-items` rows of kind `avatar`: paid tiers first, then the free icons. */
export function mockAvatarItems(lang: Lang, holder: Holder): Record<string, unknown>[] {
  const paid = PAID.map(([key, rarity, group, minted, pt, en], index) => {
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
      allows_outfit: false,
      price_usd_cents: tier.cents,
      price_lamports: tier.cents * LAMPORTS_PER_CENT,
      price_label: `US$ ${(tier.cents / 100).toFixed(2)} ≈ ${solOf(tier.cents)} SOL`,
      image_url: imageOf(index),
      thumb_url: imageOf(index),
      supply: { minted: Math.min(tier.max ?? Infinity, minted + (owned ? 1 : 0)), max: tier.max },
      owned,
      equipped: holder.avatar === key,
      asset_address: owned ? holder.asset : null,
      art: {},
    };
  });
  const free = FREE.map(([key, pt, en], index) => ({
    key,
    kind: 'avatar',
    title: lang === 'en' ? en : pt,
    description: lang === 'en' ? 'A free icon. Yours from day one.' : 'Um ícone grátis. Seu desde o primeiro dia.',
    rarity: 'common',
    rarity_label: lang === 'en' ? 'Free' : 'Grátis',
    tier_name: lang === 'en' ? 'Free icons' : 'Ícones grátis',
    group: 'expression',
    free: true,
    allows_outfit: true,
    price_usd_cents: 0,
    price_lamports: 0,
    price_label: lang === 'en' ? 'Free' : 'Grátis',
    image_url: imageOf(index),
    thumb_url: imageOf(index),
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
