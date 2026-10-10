/** Catalog of the mock shop: the items the backend seeds active, with both languages. */
import type { ShopItemKind } from '@/types/shop';

export interface MockItem {
  key: string;
  kind: ShopItemKind;
  cents: number;
  lamports: number;
  title: { pt: string; en: string };
  description: { pt: string; en: string };
  art: Record<string, unknown>;
  /** Wire `effect` of a life pack. */
  effect?: Record<string, unknown>;
  crystals?: number;
}

export const MOCK_ITEMS: readonly MockItem[] = [
  {
    key: 'life_refill',
    kind: 'life',
    cents: 10,
    lamports: 500_000,
    title: { pt: 'Recarga de vidas', en: 'Life refill' },
    description: { pt: 'Enche as 5 vidas do Tera na hora.', en: "Fills Tera's 5 lives right away." },
    art: {},
  },
  {
    key: 'lives_10',
    kind: 'life',
    cents: 30,
    lamports: 1650000,
    title: { pt: '10 vidas', en: '10 lives' },
    description: { pt: 'Soma 10 vidas, mesmo acima do máximo.', en: 'Adds 10 lives, even above the maximum.' },
    art: {},
    effect: { add_lives: 10 },
    crystals: 40,
  },
  {
    key: 'lives_30',
    kind: 'life',
    cents: 80,
    lamports: 4400000,
    title: { pt: '30 vidas', en: '30 lives' },
    description: { pt: 'Soma 30 vidas, mesmo acima do máximo.', en: 'Adds 30 lives, even above the maximum.' },
    art: {},
    effect: { add_lives: 30 },
    crystals: 100,
  },
  {
    key: 'lives_50',
    kind: 'life',
    cents: 120,
    lamports: 6600000,
    title: { pt: '50 vidas', en: '50 lives' },
    description: { pt: 'Soma 50 vidas, mesmo acima do máximo.', en: 'Adds 50 lives, even above the maximum.' },
    art: {},
    effect: { add_lives: 50 },
    crystals: 150,
  },
  {
    key: 'lives_100',
    kind: 'life',
    cents: 200,
    lamports: 11000000,
    title: { pt: '100 vidas', en: '100 lives' },
    description: { pt: 'Soma 100 vidas, mesmo acima do máximo.', en: 'Adds 100 lives, even above the maximum.' },
    art: {},
    effect: { add_lives: 100 },
    crystals: 250,
  },
  {
    key: 'lives_infinite',
    kind: 'life',
    cents: 1000,
    lamports: 55_000_000,
    title: { pt: 'Vidas infinitas', en: 'Infinite lives' },
    description: { pt: 'Nenhuma vida se perde por 30 dias.', en: 'No life is lost for 30 days.' },
    art: {},
    effect: { unlimited_days: 30 },
    crystals: 1000,
  },
  {
    key: 'outfit_glasses',
    kind: 'outfit',
    cents: 20,
    lamports: 1_000_000,
    title: { pt: 'Óculos de estudo', en: 'Study glasses' },
    description: { pt: 'Para ler código sem piscar.', en: 'For reading code without blinking.' },
    art: {},
  },
  {
    key: 'outfit_headphones',
    kind: 'outfit',
    cents: 25,
    lamports: 1_250_000,
    title: { pt: 'Fones de foco', en: 'Focus headphones' },
    description: { pt: 'Lo-fi ligado, mundo desligado.', en: 'Lo-fi on, world off.' },
    art: {},
  },
  {
    key: 'outfit_crown',
    kind: 'outfit',
    cents: 30,
    lamports: 1_500_000,
    title: { pt: 'Coroa da trilha', en: 'Trail crown' },
    description: { pt: 'Para quem termina o que começa.', en: 'For those who finish what they start.' },
    art: {},
  },
  {
    key: 'ink_emerald',
    kind: 'ink',
    cents: 15,
    lamports: 750_000,
    title: { pt: 'Tinta esmeralda', en: 'Emerald ink' },
    description: { pt: 'Carimbos verdes numa certificação.', en: 'Green stamps on one certification.' },
    art: { color: '#3FD17F' },
  },
  {
    key: 'ink_violet',
    kind: 'ink',
    cents: 15,
    lamports: 750_000,
    title: { pt: 'Tinta violeta', en: 'Violet ink' },
    description: { pt: 'Carimbos violeta numa certificação.', en: 'Violet stamps on one certification.' },
    art: { color: '#9B8CFF' },
  },
  {
    key: 'frame_gold_leaf',
    kind: 'frame',
    cents: 30,
    lamports: 1_500_000,
    title: { pt: 'Moldura folha de ouro', en: 'Gold leaf frame' },
    description: { pt: 'Uma borda dourada para a certificação favorita.', en: 'A golden border for your favourite certification.' },
    art: { color: '#F2C66D' },
  },
];
