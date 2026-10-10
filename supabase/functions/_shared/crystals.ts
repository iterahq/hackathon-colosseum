import { GLOBAL_REF, localParts, type AchievementKey } from './awards.ts';

/** The single life sold for crystals. Not a `shop_items` row: its price lives here. */
export const LIFE_KEY = 'life';
export const LIFE_PRICE = 5;
export const MAX_LIFE_QTY = 5;
/** The ledger reason of every debit. */
export const SPEND_REASON = 'spend';
export const LEDGER_PAGE = 20;

export type EarnReason =
  | 'lesson_completed'
  | 'lesson_clean'
  | 'day_completed'
  | 'trail_completed'
  | 'streak_7'
  | 'invite_friend'
  | 'invited'
  | 'podium_1'
  | 'podium_2'
  | 'podium_3';

export interface EarnRule {
  reason: EarnReason;
  crystals: number;
  label: { pt: string; en: string };
}

/** How crystals are earned. Each rule pays once per (learner, reason, ref). */
export const EARN_RULES: readonly EarnRule[] = [
  { reason: 'lesson_completed', crystals: 2, label: { pt: 'Lição concluída', en: 'Lesson completed' } },
  { reason: 'lesson_clean', crystals: 3, label: { pt: 'Lição sem perder vida', en: 'Lesson with no life lost' } },
  { reason: 'day_completed', crystals: 10, label: { pt: 'Dia concluído (carimbo)', en: 'Day completed (stamp)' } },
  { reason: 'trail_completed', crystals: 100, label: { pt: 'Trilha concluída', en: 'Trail completed' } },
  { reason: 'streak_7', crystals: 30, label: { pt: '7 dias seguidos', en: '7-day streak' } },
  { reason: 'invite_friend', crystals: 50, label: { pt: 'Amigo convidado concluiu a primeira lição', en: 'An invited friend finished a first lesson' } },
  { reason: 'invited', crystals: 20, label: { pt: 'Chegou por um convite', en: 'Arrived by an invite' } },
  { reason: 'podium_1', crystals: 30, label: { pt: '1º lugar na aula ao vivo', en: '1st place in a live class' } },
  { reason: 'podium_2', crystals: 20, label: { pt: '2º lugar na aula ao vivo', en: '2nd place in a live class' } },
  { reason: 'podium_3', crystals: 10, label: { pt: '3º lugar na aula ao vivo', en: '3rd place in a live class' } },
];

export function earnAmount(reason: EarnReason): number {
  const rule = EARN_RULES.find((entry) => entry.reason === reason);
  if (!rule) throw new Error(`crystals: unknown earn reason ${reason}`);
  return rule.crystals;
}

export function earnRulesView(lang: 'pt' | 'en'): Array<{ reason: EarnReason; crystals: number; label: string }> {
  return EARN_RULES.map((rule) => ({ reason: rule.reason, crystals: rule.crystals, label: rule.label[lang] }));
}

/** What an award row that was just created pays. The row's `ref_id` is the idempotency ref. */
export function earnsForAward(key: AchievementKey | string): EarnReason[] {
  switch (key) {
    case 'day_stamp':
      return ['lesson_completed', 'day_completed'];
    case 'trail_complete':
      return ['trail_completed'];
    case 'streak_7':
      return ['streak_7'];
    default:
      return [];
  }
}

/** An earning named by its ledger key. */
export interface EarningKey {
  reason: EarnReason;
  refId: string;
}

/** The lesson earns that share the per-day cap in the database (`itera.crystal_grant`). */
export const LESSON_REASONS: readonly EarnReason[] = ['lesson_completed', 'lesson_clean'];
export const LESSON_DAILY_CAP = 40;

/**
 * Lessons whose stamp day cost no life: no `lose` event of the learner on any
 * activity of the lesson, on the local day of the stamp. Derived from the
 * server's own event log (`life_events`), never from what a request said.
 */
export function cleanLessonIds(
  stamps: ReadonlyArray<{ lessonId: string; earnedAt: string }>,
  activities: ReadonlyArray<{ id: string; lesson_id: string }>,
  losses: ReadonlyArray<{ activity_id: string | null; created_at: string }>,
  timeZone: string,
): Set<string> {
  const lessonOf = new Map(activities.map((activity) => [activity.id, activity.lesson_id]));
  const lossDays = new Map<string, Set<string>>();
  for (const loss of losses) {
    const lesson = loss.activity_id ? lessonOf.get(loss.activity_id) : undefined;
    if (!lesson) continue;
    const days = lossDays.get(lesson) ?? new Set<string>();
    days.add(localParts(loss.created_at, timeZone).date);
    lossDays.set(lesson, days);
  }
  return new Set(stamps.filter((stamp) => !lossDays.get(stamp.lessonId)?.has(localParts(stamp.earnedAt, timeZone).date)).map((stamp) => stamp.lessonId));
}

/**
 * Every earning the learner's stored award rows entitle them to. The rows are
 * the server's own (stamps are written only after the plausibility floor), so
 * paying from them, every call, is safe: the ledger key makes it idempotent and
 * a payment that failed once is simply found missing the next time.
 */
export function earningsOfRows(rows: ReadonlyArray<{ achievement_key: string; ref_id: string; earned_at?: string }>, cleanLessons: ReadonlySet<string>): EarningKey[] {
  const keys: EarningKey[] = [];
  for (const row of rows) {
    for (const reason of earnsForAward(row.achievement_key)) keys.push({ reason, refId: row.ref_id });
    if (row.achievement_key === 'day_stamp' && cleanLessons.has(row.ref_id)) keys.push({ reason: 'lesson_clean', refId: row.ref_id });
    const place = podiumPositionOfKey(row.achievement_key);
    if (place) keys.push({ reason: place, refId: row.ref_id });
    if (row.achievement_key === 'friend_brought') keys.push({ reason: 'invite_friend', refId: row.ref_id });
    if (row.achievement_key === 'invited') keys.push({ reason: 'invited', refId: GLOBAL_REF });
  }
  return keys;
}

function podiumPositionOfKey(key: string): EarnReason | null {
  return key === 'podium_1' ? 'podium_1' : key === 'podium_2' ? 'podium_2' : key === 'podium_3' ? 'podium_3' : null;
}

/** What is still unpaid: the entitled earnings with no ledger row yet (`reason|ref` keys). */
export function missingEarnings(entitled: readonly EarningKey[], paid: ReadonlySet<string>): EarningKey[] {
  const seen = new Set<string>();
  return entitled.filter((earning) => {
    const key = `${earning.reason}|${earning.refId}`;
    if (paid.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function podiumReason(position: number): EarnReason | null {
  return position === 1 ? 'podium_1' : position === 2 ? 'podium_2' : position === 3 ? 'podium_3' : null;
}

export interface PricedItem {
  key: string;
  kind: string;
  price_crystals: number | null;
  effect: Record<string, unknown>;
  title_i18n?: Record<string, string>;
}

/** The crystal price of an item; `null` when it is not sold for crystals. */
export function priceOf(item: Pick<PricedItem, 'price_crystals'>): number | null {
  const price = item.price_crystals;
  return typeof price === 'number' && Number.isInteger(price) && price > 0 ? price : null;
}

/** Every price the client shows: the items sold for crystals plus the single life. */
export function pricesOf(items: PricedItem[]): Record<string, number> {
  const prices: Record<string, number> = {};
  for (const item of items) {
    const price = priceOf(item);
    if (price !== null) prices[item.key] = price;
  }
  return { ...prices, [LIFE_KEY]: LIFE_PRICE };
}

/** `qty` of a life purchase: absent reads as 1; anything but an integer 1–5 is malformed. */
export function lifeQty(value: unknown): number | null {
  if (value === undefined || value === null) return 1;
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_LIFE_QTY ? value : null;
}

/** Lives bought one by one fill up to the maximum, never the bonus slot: only what fits is sold and charged. */
export function lifePurchase(facts: { lives: number; maxLives: number; qty: number }): { added: number; price: number } | 'not_needed' {
  const added = Math.min(facts.qty, facts.maxLives - facts.lives);
  return added > 0 ? { added, price: added * LIFE_PRICE } : 'not_needed';
}

export type SpendVerdict = { ok: true; price: number } | { ok: false; error: 'not_for_crystals' } | { ok: false; error: 'insufficient_crystals'; price: number };

/** Whether `balance` buys an item with this price. The database repeats the balance check under a lock. */
export function spendVerdict(price: number | null, balance: number): SpendVerdict {
  if (price === null) return { ok: false, error: 'not_for_crystals' };
  return balance >= price ? { ok: true, price } : { ok: false, error: 'insufficient_crystals', price };
}

/**
 * The ledger key of a debit. Something owned once is keyed by what it is, so
 * two requests for it are one debit; something consumed gets a fresh key each time.
 */
export function spendRef(itemKey: string, refId: string, consumable: boolean, nonce: string, refunded = 0): string {
  if (consumable) return `${itemKey}:${nonce}`;
  // A purchase that was refunded is over for good: the next attempt at the same item is a new debit with its own key.
  return refunded > 0 ? `${itemKey}:${refId}:r${refunded}` : `${itemKey}:${refId}`;
}

export const THEME_SLOTS = { background: 'background', icon: 'app_icon', border: 'border' } as const;
export type ThemeSlot = keyof typeof THEME_SLOTS;
export const THEME_KINDS: readonly string[] = Object.values(THEME_SLOTS);
/** Used when the catalog row of a default is missing. */
const FALLBACK_THEME = {
  background: { key: 'bg_obsidian', color: '#0A0908' },
  icon: { key: 'icon_green', color: '#3FD17F' },
  border: { key: 'border_none', title: 'No border', border: null },
};

export const BORDER_STYLES = ['solid', 'gradient', 'conic', 'dashed', 'double'] as const;
const MAX_BORDER_COLORS = 8;

/** A profile border, drawn by the front end on top of the avatar's own ring. */
export interface BorderSpec {
  style: (typeof BORDER_STYLES)[number];
  colors: string[];
  glow: boolean;
  animated: boolean;
}

export interface ThemeColorChoice {
  key: string;
  color: string;
}
export interface ThemeBorderChoice {
  key: string;
  title: string;
  border: BorderSpec | null;
}
export interface Theme {
  background: ThemeColorChoice;
  icon: ThemeColorChoice;
  border: ThemeBorderChoice;
}

export const isThemeDefault = (item: Pick<PricedItem, 'effect'>): boolean => item.effect?.default === true;

export function themeColor(item: Pick<PricedItem, 'kind' | 'effect'>): string | null {
  const color = item.kind === THEME_SLOTS.background ? item.effect?.background : item.kind === THEME_SLOTS.icon ? item.effect?.icon : null;
  return typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color) ? color : null;
}

/** The `effect.border` of a row, checked: `null` when it is missing or malformed. */
export function borderOf(item: Pick<PricedItem, 'kind' | 'effect'>): BorderSpec | null {
  if (item.kind !== THEME_SLOTS.border) return null;
  const raw = item.effect?.border;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { style, colors, glow, animated } = raw as Record<string, unknown>;
  if (!BORDER_STYLES.includes(style as BorderSpec['style'])) return null;
  if (!Array.isArray(colors) || colors.length === 0 || colors.length > MAX_BORDER_COLORS) return null;
  if (!colors.every((color) => typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color))) return null;
  return { style: style as BorderSpec['style'], colors: colors as string[], glow: glow === true, animated: animated === true };
}

/** A row that can be worn in a theme slot: a colour, or a border (the default border has no spec: the art's own ring). */
export function isThemeEntry(item: Pick<PricedItem, 'kind' | 'effect'>): boolean {
  if (item.kind === THEME_SLOTS.border) return isThemeDefault(item) || borderOf(item) !== null;
  return themeColor(item) !== null;
}

const pickTitle = (item: Pick<PricedItem, 'title_i18n'>, lang: 'pt' | 'en'): string => item.title_i18n?.[lang] ?? item.title_i18n?.pt ?? '';

/** The theme a learner sees: what they chose while it is still theirs to wear, otherwise the default. */
export function themeOf(
  items: PricedItem[],
  chosen: Partial<Record<ThemeSlot, string | null>>,
  ownedKeys: ReadonlySet<string>,
  lang: 'pt' | 'en' = 'pt',
): Theme {
  const pick = (slot: ThemeSlot) => {
    const ofKind = items.filter((item) => item.kind === THEME_SLOTS[slot] && isThemeEntry(item));
    const wanted = ofKind.find((item) => item.key === chosen[slot] && (isThemeDefault(item) || ownedKeys.has(item.key)));
    return wanted ?? ofKind.find(isThemeDefault) ?? null;
  };
  const colour = (slot: 'background' | 'icon'): ThemeColorChoice => {
    const item = pick(slot);
    return item ? { key: item.key, color: themeColor(item) as string } : FALLBACK_THEME[slot];
  };
  const border = pick('border');
  return {
    background: colour('background'),
    icon: colour('icon'),
    border: border ? { key: border.key, title: pickTitle(border, lang), border: borderOf(border) } : FALLBACK_THEME.border,
  };
}

export type EquipVerdict = 'ok' | 'unknown_item' | 'not_owned';

export function equipVerdict(slot: ThemeSlot, item: PricedItem | undefined, ownedKeys: ReadonlySet<string>): EquipVerdict {
  if (!item || item.kind !== THEME_SLOTS[slot] || !isThemeEntry(item)) return 'unknown_item';
  return isThemeDefault(item) || ownedKeys.has(item.key) ? 'ok' : 'not_owned';
}

/** The slots an equip body names. `null` when it names none or is malformed. */
export function equipRequest(body: Record<string, unknown>): Partial<Record<ThemeSlot, string>> | null {
  const source = body.equip && typeof body.equip === 'object' && !Array.isArray(body.equip) ? (body.equip as Record<string, unknown>) : body;
  const wanted: Partial<Record<ThemeSlot, string>> = {};
  for (const slot of Object.keys(THEME_SLOTS) as ThemeSlot[]) {
    const value = source[slot];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length === 0 || value.length > 64) return null;
    wanted[slot] = value;
  }
  return Object.keys(wanted).length > 0 ? wanted : null;
}

/** How long the token mirror waits after a write before writing again; changes inside the window become one write. */
export const TOKEN_MIRROR_COOLDOWN_MS = 15_000;
export const TOKEN_MIRROR_STALE_MS = 90_000;

export type MirrorStep = { op: 'none' } | { op: 'mint'; amount: number } | { op: 'burn'; amount: number };

/** What brings the token balance to the ledger balance. */
export function mirrorStep(ledgerBalance: number, tokenBalance: number): MirrorStep {
  const difference = Math.trunc(ledgerBalance) - Math.trunc(tokenBalance);
  if (difference > 0) return { op: 'mint', amount: difference };
  if (difference < 0) return { op: 'burn', amount: -difference };
  return { op: 'none' };
}

export function mirrorCooldownLeftMs(lastWriteAt: string | null, now: Date): number {
  if (!lastWriteAt) return 0;
  return Math.max(0, new Date(lastWriteAt).getTime() + TOKEN_MIRROR_COOLDOWN_MS - now.getTime());
}
