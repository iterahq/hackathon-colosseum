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
