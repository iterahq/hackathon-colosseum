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

const PAGE = 1000;
const IN_CHUNK = 150;

/** Every row of a filtered read, a page at a time: PostgREST caps one answer (1 000 by default), so no single read is trusted to be whole. */
export async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, label: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

const chunks = <T>(list: readonly T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, index) => list.slice(index * size, (index + 1) * size));

/** The `lose` events of the learner on these activities only (the ones of the stamped lessons being checked). */
export async function loadLossesOn(db: IteraClient, userId: string, activityIds: readonly string[]): Promise<Array<{ activity_id: string | null; created_at: string }>> {
  const found: Array<{ activity_id: string | null; created_at: string }> = [];
  for (const ids of chunks(activityIds, IN_CHUNK)) {
    found.push(
      ...(await readAll<{ activity_id: string | null; created_at: string }>(
        (from, to) => db.from('life_events').select('activity_id,created_at').eq('user_id', userId).eq('kind', 'lose').in('activity_id', ids).order('created_at').order('id').range(from, to),
        'life_events',
      )),
    );
  }
  return found;
}

/** The ledger keys (`reason|ref`) the caller already has for exactly these reasons and refs. */
export async function loadPaidKeys(db: IteraClient, userId: string, entitled: ReadonlyArray<{ reason: string; refId: string }>): Promise<Set<string>> {
  const paid = new Set<string>();
  const reasons = [...new Set(entitled.map((earning) => earning.reason))];
  const refs = [...new Set(entitled.map((earning) => earning.refId))];
  for (const some of chunks(refs, IN_CHUNK)) {
    const rows = await readAll<{ reason: string; ref_id: string }>(
      (from, to) => db.from('crystal_ledger').select('reason,ref_id').eq('user_id', userId).in('reason', reasons).in('ref_id', some).order('created_at').order('id').range(from, to),
      'crystal_ledger',
    );
    for (const row of rows) paid.add(`${row.reason}|${row.ref_id}`);
  }
  return paid;
}

export interface RefundedPurchase {
  id: string;
  memo: string;
}

/** Refunded crystal purchases whose refund ledger row is missing, with what the debit took (`-delta` of the spend row keyed by the purchase memo). */
export function refundsDue(
  refunded: readonly RefundedPurchase[],
  refundedIds: ReadonlySet<string>,
  debits: ReadonlyMap<string, number>,
): Array<{ purchaseId: string; amount: number }> {
  return refunded.flatMap((purchase) => {
    const amount = debits.get(purchase.memo);
    return refundedIds.has(purchase.id) || !amount || amount >= 0 ? [] : [{ purchaseId: purchase.id, amount: -amount }];
  });
}

/**
 * A refund is two steps: the purchase is marked `refunded` first, then the crystals
 * come back. If the second one failed, this pays it: any refunded crystal purchase
 * with no `refund` ledger row (keyed by the purchase id, so it is idempotent). Never throws.
 */
export async function reconcileRefunds(db: IteraClient, userId: string): Promise<number> {
  try {
    const refunded = await readAll<RefundedPurchase>(
      (from, to) => db.from('purchases').select('id,memo').eq('user_id', userId).eq('source', 'crystals').eq('status', 'refunded').order('created_at').order('id').range(from, to),
      'purchases refunded',
    );
    if (refunded.length === 0) return 0;
    const credited = new Set<string>();
    for (const some of chunks(refunded.map((purchase) => purchase.id), IN_CHUNK)) {
      for (const row of await readAll<{ ref_id: string }>((from, to) => db.from('crystal_ledger').select('ref_id').eq('user_id', userId).eq('reason', 'refund').in('ref_id', some).order('id').range(from, to), 'crystal_ledger refunds')) {
        credited.add(row.ref_id);
      }
    }
    const debits = new Map<string, number>();
    for (const some of chunks(refunded.map((purchase) => purchase.memo), IN_CHUNK)) {
      for (const row of await readAll<{ ref_id: string; delta: number }>((from, to) => db.from('crystal_ledger').select('ref_id,delta').eq('user_id', userId).eq('reason', SPEND_REASON).in('ref_id', some).order('id').range(from, to), 'crystal_ledger debits')) {
        debits.set(row.ref_id, row.delta);
      }
    }
    let paid = 0;
    for (const due of refundsDue(refunded, credited, debits)) {
      const { isNew } = await grantCrystals(db, userId, due.amount, 'refund', due.purchaseId);
      if (isNew) paid += 1;
    }
    if (paid > 0) inBackground(import('./crystals-mirror.ts').then((mirror) => mirror.mirrorCrystals(db, userId)));
    return paid;
  } catch (error) {
    console.error(`crystals: refund reconcile for ${userId} failed`, error);
    return 0;
  }
}

/**
 * Refunds a crystal purchase in two steps, in this order: the row becomes `refunded` (checked: if that fails
 * nothing was credited and the purchase is still paid), then the crystals are credited back, idempotent on the purchase id.
 * If the credit fails the row is `refunded` with no credit; `reconcileRefunds` pays it on the next call.
 */
export async function refundCrystalPurchase(db: IteraClient, userId: string, purchaseId: string, amount: number, code: string): Promise<{ balance: number }> {
  const { error } = await db.from('purchases').update({ status: 'refunded', refunded_at: new Date().toISOString(), error: code }).eq('id', purchaseId).eq('user_id', userId);
  if (error) throw new Error(`purchases refunded: ${error.message}`);
  const { balance } = await grantCrystals(db, userId, amount, 'refund', purchaseId);
  return { balance };
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
      const stamped = new Set(stamps.map((stamp) => stamp.lessonId));
      const losses = await loadLossesOn(db, userId, activities.filter((activity) => stamped.has(activity.lesson_id)).map((activity) => activity.id));
      clean = cleanLessonIds(stamps, activities, losses, TIME_ZONE);
    }
    const entitled = earningsOfRows(rows, clean);
    // A refund whose credit failed earlier is paid on the same pass.
    await reconcileRefunds(db, userId);
    if (entitled.length === 0) return 0;
    const paid = await loadPaidKeys(db, userId, entitled);
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

/** Every item key this learner holds, whatever the kind: small, and readable before the catalog is. */
export async function ownedItemKeys(db: IteraClient, userId: string): Promise<Set<string>> {
  const { data, error } = await db.from('user_inventory').select('item_key').eq('user_id', userId).gt('qty', 0);
  if (error) throw new Error(`user_inventory owned: ${error.message}`);
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
