import { withClaims } from './claims.ts';
import { claimsByRow } from './claims-store.ts';
import { withCosmetics, type CosmeticPurchase } from './cosmetics.ts';
import type { IteraClient } from './db.ts';
import { withEndorsements, type Endorsement } from './endorsement.ts';
import { withChests } from './tera-roll.ts';

interface TrailRow {
  /** Present on rows read whole; the endorsements of a certification are keyed by it. */
  id?: string;
  user_id: string;
  achievement_key: string;
  ref_id: string;
  state: Record<string, unknown>;
}

const trailKey = (userId: string, refId: string) => `${userId}:${refId}`;

/** Every paid ink and frame of these learners, grouped by (learner, trail). */
async function paidCosmetics(db: IteraClient, userIds: string[]): Promise<Map<string, CosmeticPurchase[]>> {
  const byTrail = new Map<string, CosmeticPurchase[]>();
  if (userIds.length === 0) return byTrail;
  const { data, error } = await db
    .from('purchases')
    .select('user_id,ref_id,paid_at,shop_items(kind,effect)')
    .in('user_id', userIds)
    .eq('status', 'paid');
  if (error) throw new Error(`purchases: ${error.message}`);
  const rows = (data ?? []) as unknown as Array<{
    user_id: string;
    ref_id: string;
    paid_at: string | null;
    shop_items: { kind: string; effect: Record<string, unknown> } | null;
  }>;
  for (const row of rows) {
    const kind = row.shop_items?.kind;
    if (kind !== 'ink' && kind !== 'frame') continue;
    const key = trailKey(row.user_id, row.ref_id);
    byTrail.set(key, [...(byTrail.get(key) ?? []), { kind, value: row.shop_items?.effect?.value, paid_at: row.paid_at ?? '' }]);
  }
  return byTrail;
}

/** The paid cosmetics of one learner for one trail. */
export async function trailCosmeticPurchases(db: IteraClient, userId: string, refId: string): Promise<CosmeticPurchase[]> {
  return (await paidCosmetics(db, [userId])).get(trailKey(userId, refId)) ?? [];
}

/**
 * The same rows with every `trail_pass` wearing what its learner paid for.
 * Every reader of cosmetics (art, metadata, on-chain attributes, inventory,
 * profile) goes through here, so a row whose `state.cosmetics` was overwritten
 * still shows, and still writes to chain, the ink and frame that were bought.
 */
export async function restoreCosmetics<Row extends TrailRow>(db: IteraClient, rows: Row[]): Promise<Row[]> {
  const passports = rows.filter((row) => row.achievement_key === 'trail_pass');
  if (passports.length === 0) return rows;
  const rowIds = passports.flatMap((row) => (row.id ? [row.id] : []));
  const [paid, endorsed, claims, chests] = await Promise.all([
    paidCosmetics(db, [...new Set(passports.map((row) => row.user_id))]),
    endorsementsByRow(db, rowIds),
    claimsByRow(db, rowIds),
    chestCommitsByRow(db, rowIds),
  ]);
  return rows.map((row) => {
    if (row.achievement_key !== 'trail_pass') return row;
    const worn = withCosmetics(row, paid.get(trailKey(row.user_id, row.ref_id)) ?? []);
    return row.id ? withChests(withClaims(withEndorsements(worn, endorsed.get(row.id) ?? []), claims.get(row.id) ?? []), chests.get(row.id) ?? new Map()) : worn;
  });
}

/**
 * The day-chest commitments of these certification rows, from the table of
 * record: row id -> day -> the `chest:<day>` value. They ride in `state` like
 * the claims, so a later stamp, ink or endorsement keeps them on the asset.
 * Never throws: a failed read means "none", and the next write puts them back.
 */
export async function chestCommitsByRow(db: IteraClient, rowIds: string[]): Promise<Map<string, Map<number, string>>> {
  const byRow = new Map<string, Map<number, string>>();
  if (rowIds.length === 0) return byRow;
  try {
    const { data, error } = await db.from('tera_chests').select('certification_id,day,commit_value,status,commit_tx').in('certification_id', rowIds);
    if (error) throw new Error(error.message);
    for (const entry of (data ?? []) as Array<{ certification_id: string; day: number; commit_value: string; status: string; commit_tx: string | null }>) {
      // A chest that failed before any commitment reached the chain has nothing to keep there.
      if (entry.status === 'failed' && entry.commit_tx === null) continue;
      const days = byRow.get(entry.certification_id) ?? new Map<number, string>();
      days.set(entry.day, entry.commit_value);
      byRow.set(entry.certification_id, days);
    }
  } catch (error) {
    console.error('tera chests: commitments unavailable', error instanceof Error ? error.message : error);
  }
  return byRow;
}

/**
 * The teacher endorsements of these certification rows, from the table of
 * record. Like the cosmetics, they ride in `state` for every reader and every
 * chain write, so a later stamp or ink never drops them from the asset.
 */
export async function endorsementsByRow(db: IteraClient, rowIds: string[]): Promise<Map<string, Endorsement[]>> {
  const byRow = new Map<string, Endorsement[]>();
  if (rowIds.length === 0) return byRow;
  const { data, error } = await db.from('endorsements').select('user_achievement_id,slot,wallet,created_at').in('user_achievement_id', rowIds).order('slot');
  if (error) throw new Error(`endorsements: ${error.message}`);
  for (const entry of (data ?? []) as Array<{ user_achievement_id: string; slot: number; wallet: string; created_at: string }>) {
    byRow.set(entry.user_achievement_id, [...(byRow.get(entry.user_achievement_id) ?? []), { slot: entry.slot, wallet: entry.wallet, at: new Date(entry.created_at).toISOString() }]);
  }
  return byRow;
}
