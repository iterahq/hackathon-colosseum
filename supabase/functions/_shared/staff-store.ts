import type { IteraClient } from './db.ts';
import type { Membership } from './staff.ts';

/** The memberships of an itera user with each tenant's slug, straight from the tables the RLS helpers read. */
export async function loadMemberships(db: IteraClient, userId: string): Promise<Membership[]> {
  const { data, error } = await db.from('memberships').select('tenant_id,role,tenants(slug)').eq('user_id', userId);
  if (error) throw new Error(`memberships: ${error.message}`);
  return ((data ?? []) as unknown as Array<{ tenant_id: string; role: string; tenants: { slug: string } | Array<{ slug: string }> | null }>).map((row) => ({
    tenant_id: row.tenant_id,
    role: row.role,
    tenant_slug: (Array.isArray(row.tenants) ? row.tenants[0]?.slug : row.tenants?.slug) ?? null,
  }));
}
