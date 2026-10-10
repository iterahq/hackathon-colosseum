/**
 * "Circuito": half of every paid purchase goes from the treasury to the mint
 * authority, the key that pays the network fee of every stamp, so learners
 * never pay to earn a credential. All lamports are integers (`bigint`).
 */
export const CIRCUIT_SHARE_PERCENT = 50n;
/** The network fee of one stamp (one signature). */
export const STAMP_FEE_LAMPORTS = 5_000n;
/** The fee of the circuit transfer itself, paid by the treasury. */
export const TRANSFER_FEE_LAMPORTS = 5_000n;
/** The treasury also funds the devnet faucet: a transfer never takes it below this. */
export const TREASURY_FLOOR_LAMPORTS = 200_000_000n;
/** The shop's pinned rate: 1 US cent = 55 000 lamports. */
export const LAMPORTS_PER_USD_CENT = 55_000n;

export function circuitShare(purchaseLamports: bigint): bigint {
  return purchaseLamports > 0n ? (purchaseLamports * CIRCUIT_SHARE_PERCENT) / 100n : 0n;
}

export function stampsFunded(lamports: bigint): number {
  return lamports > 0n ? Number(lamports / STAMP_FEE_LAMPORTS) : 0;
}

export function usdCentsOf(lamports: bigint): number {
  return lamports > 0n ? Number(lamports / LAMPORTS_PER_USD_CENT) : 0;
}

export function circuitMemo(purchaseId: string): string {
  return `circuit:${purchaseId}`;
}

export type CircuitDecision = { action: 'send'; lamports: bigint } | { action: 'skip'; reason: 'not_paid' | 'nothing_to_send' | 'treasury_floor' };

/**
 * What a purchase moves. The amount comes only from the lamports stored on the
 * paid purchase row; the treasury must stay at or above its floor after the
 * transfer and its fee.
 */
export function circuitDecision(facts: { status: string; source: string; purchaseLamports: bigint; treasuryBalance: bigint }): CircuitDecision {
  if (facts.status !== 'paid' || facts.source !== 'payment') return { action: 'skip', reason: 'not_paid' };
  const lamports = circuitShare(facts.purchaseLamports);
  if (lamports <= 0n) return { action: 'skip', reason: 'nothing_to_send' };
  if (facts.treasuryBalance - lamports - TRANSFER_FEE_LAMPORTS < TREASURY_FLOOR_LAMPORTS) return { action: 'skip', reason: 'treasury_floor' };
  return { action: 'send', lamports };
}

export interface CircuitTotals {
  total_lamports: number;
  total_usd_cents: number;
  purchases: number;
  stamps_funded: number;
}

export function circuitTotals(sent: ReadonlyArray<{ circuit_lamports: number | string | null }>): CircuitTotals {
  const total = sent.reduce((sum, row) => sum + BigInt(row.circuit_lamports ?? 0), 0n);
  return { total_lamports: Number(total), total_usd_cents: usdCentsOf(total), purchases: sent.length, stamps_funded: stampsFunded(total) };
}
