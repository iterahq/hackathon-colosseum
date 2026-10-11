import type { IteraClient } from './db.ts';

const PAGE = 1000;

/**
 * The accounts the team's tests created (`itera.test_accounts`, migration 0193).
 * A public number leaves them out. Never throws: when the list cannot be read
 * the caller counts everybody and the failure is logged.
 */
export async function loadTestAccountIds(db: IteraClient): Promise<Set<string>> {
  const ids = new Set<string>();
  try {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db.from('test_accounts').select('user_id').order('user_id').range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) ids.add(row.user_id as string);
      if (!data || data.length < PAGE) break;
    }
  } catch (error) {
    console.error('test accounts unavailable: public numbers include them', error instanceof Error ? error.message : error);
  }
  return ids;
}
