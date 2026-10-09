import { withCosmetics, type CosmeticPurchase } from './cosmetics.ts';
import type { IteraClient } from './db.ts';

interface TrailRow {
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
  const paid = await paidCosmetics(db, [...new Set(passports.map((row) => row.user_id))]);
  return rows.map((row) => (row.achievement_key === 'trail_pass' ? withCosmetics(row, paid.get(trailKey(row.user_id, row.ref_id)) ?? []) : row));
}
