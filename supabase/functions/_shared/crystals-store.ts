import { TIME_ZONE, inBackground } from './companion-store.ts';
import {
  LEDGER_PAGE,
  SPEND_REASON,
  THEME_KINDS,
  earnAmount,
  LESSON_REASONS,
  cleanLessonIds,
  earningsOfRows,
  missingEarnings,
  podiumReason,
  themeOf,
  type EarnReason,
  type PricedItem,
  type Theme,
  type ThemeSlot,
} from './crystals.ts';
import type { IteraClient } from './db.ts';
import { ITEM_COLUMNS, PURCHASE_COLUMNS, type PurchaseRow, type ShopItem } from './shop-items.ts';

export const CRYSTAL_ITEM_COLUMNS = ITEM_COLUMNS;
export type CrystalItem = ShopItem & { price_crystals: number | null };

export interface CrystalAccount {
  user_id: string;
  balance: number;
  wallet: string | null;
  token_account: string | null;
  mirrored_balance: number | null;
  mirrored_at: string | null;
  mirror_claimed_at: string | null;
  mirror_signature: string | null;
}

const ACCOUNT_COLUMNS = 'user_id,balance,wallet,token_account,mirrored_balance,mirrored_at,mirror_claimed_at,mirror_signature';
const NO_ACCOUNT: Omit<CrystalAccount, 'user_id'> = {
  balance: 0,
  wallet: null,
  token_account: null,
  mirrored_balance: null,
  mirrored_at: null,
  mirror_claimed_at: null,
  mirror_signature: null,
};

/** The learner's account. A learner who never earned has no row: that reads as an empty account. */
export async function loadAccount(db: IteraClient, userId: string): Promise<CrystalAccount> {
  const { data, error } = await db.from('crystal_accounts').select(ACCOUNT_COLUMNS).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`crystal_accounts: ${error.message}`);
  return (data as CrystalAccount | null) ?? { user_id: userId, ...NO_ACCOUNT };
}

export interface LedgerEntry {
  id: string;
  delta: number;
  reason: string;
  ref_id: string;
  created_at: string;
}

export async function loadLedger(db: IteraClient, userId: string, limit = LEDGER_PAGE): Promise<LedgerEntry[]> {
  const { data, error } = await db
    .from('crystal_ledger')
    .select('id,delta,reason,ref_id,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id')
    .limit(limit);
  if (error) throw new Error(`crystal_ledger: ${error.message}`);
  return (data ?? []) as LedgerEntry[];
}

/** Credits once per (learner, reason, ref). `isNew` is false when that key was already paid. */
export async function grantCrystals(db: IteraClient, userId: string, amount: number, reason: string, refId: string): Promise<{ balance: number; isNew: boolean }> {
  const { data, error } = await db.rpc('crystal_grant', { p_user_id: userId, p_amount: amount, p_reason: reason, p_ref_id: refId });
  if (error) throw new Error(`crystal_grant: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as { balance: number; is_new: boolean } | undefined;
  if (!row) throw new Error('crystal_grant: no answer');
  return { balance: row.balance, isNew: row.is_new };
}

export interface Earning {
  userId: string;
  reason: EarnReason;
  refId: string;
}

/**
 * Pays what the server has just confirmed. For the earn hooks: it never throws,
 * so a failure here cannot fail the request that confirmed the event: it is
 * logged and the request goes on. Every key pays once, so a caller may report
 * the same event again. The token mirror follows in the background.
 */
export async function earnCrystals(db: IteraClient, earnings: Earning[]): Promise<void> {
  const paid = new Set<string>();
  for (const earning of earnings) {
    try {
      const { isNew } = await grantCrystals(db, earning.userId, earnAmount(earning.reason), earning.reason, earning.refId);
      if (isNew) paid.add(earning.userId);
    } catch (error) {
      console.error(`crystals: earning ${earning.reason} for ${earning.userId} failed`, error);
    }
  }
  for (const userId of paid) inBackground(import('./crystals-mirror.ts').then((mirror) => mirror.mirrorCrystals(db, userId)));
}

/** Most grants one reconcile makes; the rest wait for the next call. */
const RECONCILE_BATCH = 40;

/**
 * Pays every earning the learner's award rows entitle them to and the ledger
 * does not show yet (stamped days, trails, streak, invites, podium places, and
 * the clean-lesson bonus derived from `life_events`). Safe to run on every
 * call: the ledger key makes a second payment a no-op, and a grant that failed
 * is found missing next time. Never throws.
 */
export async function reconcileCrystals(
  db: IteraClient,
  userId: string,
  rows: ReadonlyArray<{ achievement_key: string; ref_id: string; earned_at: string }>,
  activities: ReadonlyArray<{ id: string; lesson_id: string }>,
): Promise<number> {
  try {
    const stamps = rows.filter((row) => row.achievement_key === 'day_stamp').map((row) => ({ lessonId: row.ref_id, earnedAt: row.earned_at }));
    let clean = new Set<string>();
    if (stamps.length > 0) {
      const { data, error } = await db.from('life_events').select('activity_id,created_at').eq('user_id', userId).eq('kind', 'lose').limit(10_000);
      if (error) throw new Error(`life_events: ${error.message}`);
      clean = cleanLessonIds(stamps, activities, (data ?? []) as Array<{ activity_id: string | null; created_at: string }>, TIME_ZONE);
    }
    const entitled = earningsOfRows(rows, clean);
    if (entitled.length === 0) return 0;
    const { data: ledger, error: ledgerError } = await db.from('crystal_ledger').select('reason,ref_id').eq('user_id', userId).limit(50_000);
    if (ledgerError) throw new Error(`crystal_ledger: ${ledgerError.message}`);
    const paid = new Set((ledger ?? []).map((entry) => `${entry.reason}|${entry.ref_id}`));
    let granted = 0;
    let capped = false;
    for (const earning of missingEarnings(entitled, paid).slice(0, RECONCILE_BATCH)) {
      // The database refuses a lesson earn past the day's cap: stop asking for lesson earns this call.
      if (capped && LESSON_REASONS.includes(earning.reason)) continue;
      const { isNew } = await grantCrystals(db, userId, earnAmount(earning.reason), earning.reason, earning.refId);
      if (isNew) granted += 1;
      else if (LESSON_REASONS.includes(earning.reason)) capped = true;
    }
    if (granted > 0) inBackground(import('./crystals-mirror.ts').then((mirror) => mirror.mirrorCrystals(db, userId)));
    return granted;
  } catch (error) {
    console.error(`crystals: reconcile for ${userId} failed`, error);
    return 0;
  }
}

export function earningsOfPodium(sessionId: string, places: Array<{ user_id: string; position: number }>): Earning[] {
  return places.flatMap((place) => {
    const reason = podiumReason(place.position);
    return reason ? [{ userId: place.user_id, reason, refId: sessionId }] : [];
  });
}

export type SpendStatus = 'ok' | 'duplicate' | 'insufficient' | 'conflict';

export interface SpendInput {
  userId: string;
  amount: number;
  /** The ledger key of this debit (`spendRef`). */
  ref: string;
  /** Written as a paid `purchases` row in the same transaction. */
  purchase?: { item_key: string; ref_id: string; wallet: string };
  /** The companion row after the purchase, written in the same transaction if it is still at `version`. */
  lives?: { version: number; lives: number; last_regen_at: string; unlimited_until?: string };
}

/** The debit and what it buys, in one database transaction (`itera.crystal_spend`). */
export async function spendCrystals(db: IteraClient, input: SpendInput): Promise<{ status: SpendStatus; balance: number }> {
  const { data, error } = await db.rpc('crystal_spend', {
    p_user_id: input.userId,
    p_amount: input.amount,
    p_reason: SPEND_REASON,
    p_ref_id: input.ref,
    p_purchase: input.purchase ?? null,
    p_lives: input.lives ?? null,
  });
  if (error) throw new Error(`crystal_spend: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as { status: SpendStatus; balance: number } | undefined;
  if (!row) throw new Error('crystal_spend: no answer');
  return row;
}

/** The `purchases` row a crystal spend wrote, found by its ledger key. */
export async function loadCrystalPurchase(db: IteraClient, userId: string, ref: string): Promise<PurchaseRow | null> {
  const { data, error } = await db.from('purchases').select(PURCHASE_COLUMNS).eq('user_id', userId).eq('source', 'crystals').eq('memo', ref).maybeSingle();
  if (error) throw new Error(`purchases crystals: ${error.message}`);
  return data as PurchaseRow | null;
}

/** How many crystal purchases of this item (and ref) were refunded: each one is over for good and burns its ledger key. */
export async function countRefundedCrystalPurchases(db: IteraClient, userId: string, itemKey: string, refId: string): Promise<number> {
  const { count, error } = await db
    .from('purchases')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source', 'crystals')
    .eq('item_key', itemKey)
    .eq('ref_id', refId)
    .eq('status', 'refunded');
  if (error) throw new Error(`purchases refunded: ${error.message}`);
  return count ?? 0;
}

export async function loadCrystalItems(db: IteraClient): Promise<CrystalItem[]> {
  const { data, error } = await db.from('shop_items').select(CRYSTAL_ITEM_COLUMNS).eq('active', true).order('sort').order('key');
  if (error) throw new Error(`shop_items: ${error.message}`);
  return (data ?? []) as unknown as CrystalItem[];
}

export async function loadCrystalItem(db: IteraClient, key: string): Promise<CrystalItem | null> {
  const { data, error } = await db.from('shop_items').select(CRYSTAL_ITEM_COLUMNS).eq('key', key).maybeSingle();
  if (error) throw new Error(`shop_items: ${error.message}`);
  return data as unknown as CrystalItem | null;
}

/** The background and icon items this learner bought (the defaults are everybody's and are not rows). */
export async function ownedThemeKeys(db: IteraClient, userId: string, items: PricedItem[]): Promise<Set<string>> {
  const keys = items.filter((item) => THEME_KINDS.includes(item.kind)).map((item) => item.key);
  if (keys.length === 0) return new Set();
  const { data, error } = await db.from('user_inventory').select('item_key').eq('user_id', userId).in('item_key', keys).gt('qty', 0);
  if (error) throw new Error(`user_inventory theme: ${error.message}`);
  return new Set((data ?? []).map((row) => row.item_key as string));
}

export async function loadChoice(db: IteraClient, userId: string): Promise<Partial<Record<ThemeSlot, string | null>>> {
  const { data, error } = await db.from('learner_themes').select('background_key,icon_key,border_key').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`learner_themes: ${error.message}`);
  return { background: data?.background_key ?? null, icon: data?.icon_key ?? null, border: data?.border_key ?? null };
}

/** The learner's theme, always whole: the defaults fill whatever was not chosen. */
export async function loadTheme(db: IteraClient, userId: string, items: PricedItem[], owned?: ReadonlySet<string>, lang: 'pt' | 'en' = 'pt'): Promise<Theme> {
  const [chosen, ownedKeys] = await Promise.all([loadChoice(db, userId), owned ?? ownedThemeKeys(db, userId, items)]);
  return themeOf(items, chosen, ownedKeys, lang);
}

export async function saveThemeChoice(db: IteraClient, userId: string, wanted: Partial<Record<ThemeSlot, string>>): Promise<void> {
  const row: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
  if (wanted.background) row.background_key = wanted.background;
  if (wanted.icon) row.icon_key = wanted.icon;
  if (wanted.border) row.border_key = wanted.border;
  const { error } = await db.from('learner_themes').upsert(row, { onConflict: 'user_id' });
  if (error) throw new Error(`learner_themes save: ${error.message}`);
}
