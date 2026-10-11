import { hasUnwrittenClaims } from './claims.ts';
import type { AchievementRow } from './credential.ts';

export interface MintJob {
  type: 'create_passport' | 'update_passport' | 'create_medal';
  /** The row that owns the asset: the passport page or the medal. */
  anchor: AchievementRow;
  /** Rows this single transaction settles (the anchor included when it is being created). */
  rows: AchievementRow[];
}

const isMinted = (row: AchievementRow) => row.mint_status === 'minted';

/**
 * One transaction per asset: a passport is created with every stamp it already
 * has, or updated once for all the stamps it gained (or for claims it proved
 * that are not on chain yet). Medals mint one by one.
 */
export function planMintJobs(rows: AchievementRow[], medalKeys: ReadonlySet<string>): MintJob[] {
  const jobs: MintJob[] = [];
  for (const row of rows) {
    if (row.achievement_key === 'trail_pass') {
      const pending = rows.filter(
        (other) =>
          !isMinted(other) &&
          ((other.achievement_key === 'day_stamp' && other.state.unit_id === row.ref_id) ||
            (other.achievement_key === 'trail_complete' && other.ref_id === row.ref_id)),
      );
      if (!isMinted(row)) jobs.push({ type: 'create_passport', anchor: row, rows: [row, ...pending] });
      else if (pending.length > 0 || hasUnwrittenClaims(row.state)) jobs.push({ type: 'update_passport', anchor: row, rows: pending });
    } else if (medalKeys.has(row.achievement_key) && !isMinted(row)) {
      jobs.push({ type: 'create_medal', anchor: row, rows: [row] });
    }
  }
  return jobs.sort(
    (a, b) => a.anchor.earned_at.localeCompare(b.anchor.earned_at) || a.anchor.id.localeCompare(b.anchor.id),
  );
}
