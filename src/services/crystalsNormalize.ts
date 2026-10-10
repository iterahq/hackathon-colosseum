/** Wire (snake_case, loosely typed) -> app types for the `crystals` function. */
import { toItemBorder } from '@/services/shopNormalize';
import { DEFAULT_THEME, type AvatarBorder, type BorderStyle, type CrystalsSnapshot, type SpendResult, type Theme, type ThemeChoice, type ThemeItem, type ThemeSlot } from '@/types/crystals';

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const orNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

const STYLES: readonly BorderStyle[] = ['solid', 'gradient', 'conic', 'dashed', 'double'];
const HEX = /^#[0-9a-f]{3,8}$/i;

/** A border from the wire (parsed by the shop's own parser); null when absent or without a usable colour. */
export function toBorder(v: unknown): AvatarBorder | null {
  const b = toItemBorder(v ?? (row(v).colors ? v : null));
  if (!b || b.colors.length === 0) return null;
  return { style: STYLES.includes(b.style as BorderStyle) ? (b.style as BorderStyle) : 'solid', colors: b.colors, glow: b.glow, animated: b.animated };
}

const choice = (v: unknown, fallback: ThemeChoice): ThemeChoice => {
  const r = row(v);
  const key = str(r.key);
  const color = HEX.test(str(r.color)) ? str(r.color) : '';
  return key && color ? { key, color } : fallback;
};

export function toTheme(v: unknown): Theme {
  const r = row(v);
  const b = row(r.border);
  const key = str(b.key);
  // The border is a block of its own, `{ key, title, border: {...} }`; a bare border object is accepted too.
  const border = key ? { key, title: str(b.title), border: toBorder(b.border ?? (b.colors ? b : null)) } : null;
  return { background: choice(r.background, DEFAULT_THEME.background), icon: choice(r.icon, DEFAULT_THEME.icon), border };
}

const SLOTS: readonly ThemeSlot[] = ['background', 'icon', 'border'];

function toThemeItem(v: unknown): ThemeItem | null {
  const r = row(v);
  const key = str(r.key);
  const slot = SLOTS.includes(r.slot as ThemeSlot) ? (r.slot as ThemeSlot) : null;
  if (!key || !slot) return null;
  const effect = row(r.effect);
  return {
    key,
    slot,
    color: HEX.test(str(r.color)) ? str(r.color) : null,
    title: str(r.title) || key,
    description: str(r.description),
    priceCrystals: typeof r.price_crystals === 'number' ? r.price_crystals : null,
    isDefault: r.default === true,
    owned: r.owned === true,
    equipped: r.equipped === true,
    forSale: r.for_sale !== false,
    includedWith: orNull(r.included_with),
    border: slot === 'border' ? toBorder(r.border ?? effect.border) : null,
    crystalsEnabled: r.crystals_enabled !== false,
    solEnabled: r.sol_enabled !== false,
  };
}

export function toCrystals(v: unknown, mocked: boolean): CrystalsSnapshot {
  const r = row(v);
  const prices: Record<string, number> = {};
  for (const [k, p] of Object.entries(row(r.prices))) if (typeof p === 'number') prices[k] = p;
  return {
    balance: Math.max(0, Math.floor(num(r.balance))),
    explorerUrl: orNull(r.explorer_url),
    prices,
    earnRules: (Array.isArray(r.earn_rules) ? r.earn_rules : []).map(row).filter((e) => str(e.reason)).map((e) => ({ reason: str(e.reason), crystals: num(e.crystals), label: str(e.label) || str(e.reason) })),
    ledger: (Array.isArray(r.ledger) ? r.ledger : []).map(row).filter((e) => str(e.id)).map((e) => ({ id: str(e.id), delta: num(e.delta), reason: str(e.reason), refId: orNull(e.ref_id), createdAt: str(e.created_at) })),
    theme: toTheme(r.theme),
    themeItems: (Array.isArray(r.theme_items) ? r.theme_items : []).map(toThemeItem).filter((i): i is ThemeItem => i !== null),
    accept: r.accept === 'sol' || r.accept === 'crystals' ? r.accept : 'both',
    mocked,
  };
}

export function toSpend(v: unknown, itemKey: string): SpendResult {
  const r = row(v);
  return { balance: Math.max(0, Math.floor(num(r.balance))), itemKey, theme: r.theme ? toTheme(r.theme) : null };
}
