import type { IteraClient } from './db.ts';
import type { Membership } from './staff.ts';

/** The memberships of an itera user, straight from the table the RLS helpers read. */
export async function loadMemberships(db: IteraClient, userId: string): Promise<Membership[]> {
  const { data, error } = await db.from('memberships').select('tenant_id,role').eq('user_id', userId);
  if (error) throw new Error(`memberships: ${error.message}`);
  return (data ?? []) as Membership[];
}
