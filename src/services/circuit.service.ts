/** The Circuito: half of every shop purchase pays the network fee of other learners' stamps. Public counter, anon key only. */
import type { CircuitCounter, CircuitShare, PurchaseCircuit } from '@/types/circuit';

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

export function toCircuitCounter(v: unknown): CircuitCounter {
  const r = row(v);
  return {
    lamports: num(r.total_lamports),
    stampsFunded: num(r.stamps_funded),
    purchases: num(r.purchases),
    treasuryExplorerUrl: orNull(r.treasury_explorer_url),
    authorityExplorerUrl: orNull(r.authority_explorer_url),
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
  const res = await fetch(`${url}/functions/v1/circuit${wallet ? `?wallet=${encodeURIComponent(wallet)}` : ''}`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
  if (!res.ok) throw new Error(`circuit failed (${res.status})`);
  return toCircuitCounter(await res.json());
}
