/**
 * Itera entitlement (subscription) data layer — PLG gating.
 *
 * Reads the caller's subscription status from the `itera.my_subscription` view
 * (a caller-scoped, RLS-isolated view over the private `billing.*` schema — the
 * player never touches `billing.*` directly). This is the authority the
 * `<RequireSubscription>` gate reads.
 *
 * Padrão do projeto: componente → hook (useQuery) → service (async, no React) →
 * fetch. No React here. Plan: 20260624-itera-plg-subscribe-flow (Phase 3).
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import type { Entitlement } from '@/types/entitlement';

type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const bool = (v: unknown): boolean => v === true;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const int = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/**
 * The current user's entitlement. Empty/inactive when not configured / not
 * signed in / no subscription. Never throws on "no row" (that's "inactive").
 */
export async function getMyEntitlement(): Promise<Entitlement> {
  const inactive: Entitlement = {
    active: false,
    status: null,
    currentPeriodEnd: null,
    seatCount: null,
    cancelAtPeriodEnd: false,
  };
  if (!isSupabaseConfigured) return inactive;
  const sb = getSupabase();
  // itera.my_subscription is in the REST-exposed `itera` schema (the client's
  // default schema). Since db/migrations/0055 it can return MORE than one row: a
  // user who belongs to an exempt tenant and also has a lapsed subscription of
  // their own gets both. Taking the first row (the old `.limit(1)`) picked one
  // at random — so the entitled row is chosen explicitly.
  const { data, error } = await sb
    .from('my_subscription')
    .select('status, is_active, current_period_end, seat_count, cancel_at_period_end');
  if (error) throw new Error(error.message);
  const rows = asRows(data);
  const row = rows.find((r) => bool(r.is_active)) ?? rows[0];
  if (!row) return inactive;
  return {
    active: bool(row.is_active),
    status: str(row.status),
    currentPeriodEnd: str(row.current_period_end),
    seatCount: int(row.seat_count),
    cancelAtPeriodEnd: bool(row.cancel_at_period_end),
  };
}
