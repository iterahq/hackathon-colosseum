/** Local stand-in for the `crystals` function, answering only behind `?mockShop=1` in a dev server. Stateful for the session. */
import { ShopCallError } from '@/services/shopTransport';

type Row = Record<string, unknown>;
const MOCK_ID = 'mock';

interface Item {
  key: string;
  slot: 'background' | 'icon' | 'border';
  title: string;
  color?: string;
  price: number | null;
  isDefault?: boolean;
  forSale?: boolean;
  includedWith?: string;
  border?: { style: string; colors: string[]; glow: boolean; animated: boolean };
}

const bg = (key: string, title: string, color: string, isDefault = false): Item => ({ key, slot: 'background', title, color, price: isDefault ? null : 75, isDefault });
const icon = (key: string, title: string, color: string, isDefault = false): Item => ({ key, slot: 'icon', title, color, price: isDefault ? null : 75, isDefault });
const border = (key: string, title: string, price: number | null, b: Item['border'], extra: Partial<Item> = {}): Item => ({ key, slot: 'border', title, price, border: b, ...extra });

const ITEMS: Item[] = [
  bg('bg_obsidian', 'Fundo Obsidiana', '#0A0908', true),
  bg('bg_midnight', 'Fundo Meia-noite', '#0B1020'),
  bg('bg_grape', 'Fundo Uva', '#150B1F'),
  bg('bg_ember', 'Fundo Brasa', '#1A0C0C'),
  bg('bg_deep_sea', 'Fundo Mar profundo', '#06181C'),
  bg('bg_graphite', 'Fundo Grafite', '#16181C'),
  icon('icon_green', 'Ícone verde', '#3FD17F', true),
  icon('icon_gold', 'Ícone dourado', '#F5B301'),
  icon('icon_violet', 'Ícone violeta', '#8B5CF6'),
  icon('icon_cyan', 'Ícone ciano', '#22D3EE'),
  icon('icon_coral', 'Ícone coral', '#FF6B5E'),
  icon('icon_white', 'Ícone branco', '#FFFFFF'),
  border('border_none', 'Sem borda extra', null, undefined, { isDefault: true }),
  border('border_bronze', 'Bronze', 100, { style: 'solid', colors: ['#CD7F32'], glow: false, animated: false }),
  border('border_emerald', 'Esmeralda', 150, { style: 'gradient', colors: ['#3FD17F', '#0E6B3E'], glow: true, animated: false }),
  border('border_pixel', 'Pixel', 200, { style: 'dashed', colors: ['#F2C66D'], glow: false, animated: false }),
  border('border_circuit', 'Circuito', 250, { style: 'double', colors: ['#22D3EE', '#0B3C49'], glow: true, animated: false }),
  border('border_crystal', 'Cristal', 300, { style: 'conic', colors: ['#8B5CF6', '#22D3EE', '#F4EDE2', '#8B5CF6'], glow: true, animated: true }),
  border('border_sol', 'Sol', null, { style: 'gradient', colors: ['#F5B301', '#FFE08A'], glow: true, animated: false }, { forSale: false, includedWith: 'special_dourado' }),
  border('border_prisma', 'Prisma', null, { style: 'conic', colors: ['#FF5E5E', '#F2C66D', '#3FD17F', '#22D3EE', '#8B5CF6', '#FF5E5E'], glow: true, animated: true }, { forSale: false, includedWith: 'special_arco_iris' }),
];

const state = { balance: 420, owned: new Set(['bg_obsidian', 'icon_green', 'border_none', 'border_bronze']), background: 'bg_obsidian', icon: 'icon_green', border: 'border_none', ledger: [] as Row[] };

const find = (key: string) => ITEMS.find((i) => i.key === key);

function theme(): Row {
  const b = find(state.border);
  return {
    background: { key: state.background, color: find(state.background)?.color },
    icon: { key: state.icon, color: find(state.icon)?.color },
    border: { key: state.border, title: b?.title ?? '', border: b?.border ?? null },
  };
}

function snapshot(): Row {
  const prices: Record<string, number> = { life: 5, life_refill: 30 };
  for (const i of ITEMS) if (i.price !== null && i.forSale !== false) prices[i.key] = i.price;
  return {
    balance: state.balance,
    mint: null,
    token_account: null,
    mirrored: false,
    explorer_url: 'https://explorer.solana.com/address/mock?cluster=devnet',
    prices,
    earn_rules: [
      { reason: 'lesson_completed', crystals: 2, label: 'Lição concluída' },
      { reason: 'lesson_clean', crystals: 3, label: 'Lição sem perder vida' },
      { reason: 'day_completed', crystals: 10, label: 'Dia completo' },
      { reason: 'trail_completed', crystals: 100, label: 'Trilha concluída' },
      { reason: 'streak_7', crystals: 30, label: 'Sequência de 7 dias' },
      { reason: 'invite_friend', crystals: 50, label: 'Amigo convidado terminou a primeira lição' },
    ],
    ledger: state.ledger.slice(0, 20),
    theme: theme(),
    theme_items: ITEMS.map((i) => ({
      key: i.key,
      slot: i.slot,
      color: i.color ?? null,
      title: i.title,
      description: '',
      price_crystals: i.price,
      default: i.isDefault === true,
      owned: state.owned.has(i.key),
      equipped: [state.background, state.icon, state.border].includes(i.key),
      for_sale: i.forSale !== false,
      included_with: i.includedWith ?? null,
      border: i.border ?? null,
    })),
  };
}

const fail = (status: number, code: string, body: Row = {}) => new ShopCallError(`crystals: ${code}`, status, code, false, null, null, { error: code, ...body });

export function mockCrystalsCall(fn: 'crystals' | 'crystals/spend' | 'crystals/equip', body: Row): unknown {
  if (fn === 'crystals') return snapshot();
  if (fn === 'crystals/spend') {
    const key = String(body.item_key ?? '');
    if (key === 'life') {
      if (state.balance < 5) throw fail(402, 'insufficient_crystals', { balance: state.balance, price: 5 });
      state.balance -= 5;
      state.ledger.unshift({ id: `${MOCK_ID}-${state.ledger.length}`, delta: -5, reason: 'spend', ref_id: `life:${MOCK_ID}`, created_at: new Date().toISOString() });
      return { balance: state.balance, item: { key: 'life', kind: 'life', qty: 1, price: 5 } };
    }
    const item = find(key);
    if (!item) throw fail(404, 'item_not_found');
    if (item.price === null || item.forSale === false) throw fail(400, 'not_for_crystals');
    if (state.owned.has(key)) throw fail(409, 'already_owned');
    if (state.balance < item.price) throw fail(402, 'insufficient_crystals', { balance: state.balance, price: item.price });
    state.balance -= item.price;
    state.owned.add(key);
    state.ledger.unshift({ id: `${MOCK_ID}-${state.ledger.length}`, delta: -item.price, reason: 'spend', ref_id: `${key}:${MOCK_ID}`, created_at: new Date().toISOString() });
    return { balance: state.balance, item: { key, kind: item.slot, title: item.title, price: item.price }, theme: theme() };
  }
  for (const slot of ['background', 'icon', 'border'] as const) {
    const key = body[slot];
    if (typeof key !== 'string') continue;
    if (!find(key)) throw fail(404, 'item_not_found', { slot });
    if (!state.owned.has(key)) throw fail(409, 'not_owned', { slot });
    state[slot] = key;
  }
  return { theme: theme() };
}
