/** The Circuito: half of every shop purchase pays the network fee of other learners' stamps. Public counter, anon key only. */
import { takePreload } from '@/services/learnerProfile.service';
import type { CircuitCounter, CircuitShare, CircuitShopRange, PurchaseCircuit } from '@/types/circuit';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const orNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export function toCircuitShare(v: unknown): CircuitShare {
  const r = row(v);
  return { lamports: num(r.lamports), stampsFunded: num(r.stamps_funded) };
}

function toShopRange(v: unknown): CircuitShopRange | null {
  const r = row(v);
  const min = num(r.min_usd_cents);
  const max = num(r.max_usd_cents);
  return min > 0 && max >= min ? { minUsdCents: min, maxUsdCents: max, items: num(r.items) } : null;
}

export function toCircuitCounter(v: unknown): CircuitCounter {
  const r = row(v);
  const outside = r.outside && typeof r.outside === 'object' ? row(r.outside) : null;
  return {
    lamports: num(r.total_lamports),
    stampsFunded: num(r.stamps_funded),
    purchases: num(r.purchases),
    asOf: orNull(r.as_of),
    purchaseLamports: num(r.purchase_lamports),
    sharePercent: num(r.share_percent) || 50,
    stampFeeLamports: num(r.stamp_fee_lamports) || 5000,
    outside: outside ? { lamports: num(outside.total_lamports), stampsFunded: num(outside.stamps_funded), purchases: num(outside.purchases), testAccountsLeftOut: num(outside.test_accounts_left_out) } : null,
    shop: toShopRange(r.shop),
    treasury: orNull(r.treasury),
    authority: orNull(r.authority),
    treasuryExplorerUrl: orNull(r.treasury_explorer_url),
    authorityExplorerUrl: orNull(r.authority_explorer_url),
    stampsIssued: typeof r.stamps_issued === 'number' ? r.stamps_issued : null,
    wallet: r.wallet && typeof r.wallet === 'object' ? toCircuitShare(r.wallet) : null,
  };
}

/**
 * What this purchase pays forward. `sent`: the transfer is confirmed. `pending`: the share is
 * fixed by the paid purchase and its transfer runs right after the answer (no link yet).
 * Null for a share of zero, a skipped or a failed transfer.
 */
export function toPurchaseCircuit(v: unknown): PurchaseCircuit | null {
  const r = row(v);
  if ((r.status !== 'sent' && r.status !== 'pending') || num(r.stamps_funded) === 0) return null;
  return { status: r.status, stampsFunded: num(r.stamps_funded), explorerUrl: orNull(r.explorer_url) };
}

export async function getCircuit(wallet: string | null): Promise<CircuitCounter> {
  if (!url || !anonKey) throw new Error('Supabase not configured.');
  const live = () => fetch(`${url}/functions/v1/circuit${wallet ? `?wallet=${encodeURIComponent(wallet)}` : ''}`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
  // The landing's counter is requested from index.html before the bundle loads; the answer is used once.
  const res = await ((wallet ? null : takePreload('__iteraCircuit', 'all', '*')) ?? live()).catch(live);
  if (!res.ok) throw new Error(`circuit failed (${res.status})`);
  return toCircuitCounter(await res.json());
}
