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

/** A transfer that never started is picked up by the retry once its purchase is this old. */
export const NEVER_RAN_AFTER_MS = 60_000;
/**
 * A transfer that was claimed (`pending`) or `failed` is looked at again after
 * this long. Well past the life of a blockhash (about 90 s): a transaction not
 * on chain by then can never land, so sending a new one cannot pay twice.
 */
export const RESEND_AFTER_MS = 3 * 60_000;
/** The retry leaves alone purchases older than this. */
export const RETRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface CircuitRetryFacts {
  status: string;
  source: string;
  circuitStatus: string | null;
  paidAt: string | null;
  circuitAt: string | null;
}

/** Whether the retry should take this purchase's transfer now. `sent` and `skipped` are final. */
export function circuitRetryDue(facts: CircuitRetryFacts, now: Date): boolean {
  if (facts.status !== 'paid' || facts.source !== 'payment' || !facts.paidAt) return false;
  const age = now.getTime() - new Date(facts.paidAt).getTime();
  if (!(age >= 0) || age > RETRY_WINDOW_MS) return false;
  if (facts.circuitStatus === null) return age >= NEVER_RAN_AFTER_MS;
  if (facts.circuitStatus !== 'pending' && facts.circuitStatus !== 'failed') return false;
  if (!facts.circuitAt) return true;
  return now.getTime() - new Date(facts.circuitAt).getTime() >= RESEND_AFTER_MS;
}

export type ResumeStep = { action: 'record'; signature: string } | { action: 'wait' } | { action: 'send' };

/**
 * What to do with a transfer that was claimed before, given what the chain
 * says. `stored`: the fate of the signature saved at broadcast time (`null`
 * when none was saved). `byMemo`: a successful treasury transaction carrying
 * this purchase's memo, when the chain has one. A transfer found on chain is
 * recorded, never sent again; one still in flight is left alone.
 */
export function resumeStep(facts: { storedSignature: string | null; stored: 'landed' | 'failed' | 'in_flight' | 'unknown' | null; byMemo: string | null }): ResumeStep {
  if (facts.storedSignature && facts.stored === 'landed') return { action: 'record', signature: facts.storedSignature };
  if (facts.byMemo) return { action: 'record', signature: facts.byMemo };
  if (facts.stored === 'in_flight') return { action: 'wait' };
  return { action: 'send' };
}

/** What a paid purchase will move, known from the row alone: the line the buyer reads before the transfer lands. */
export function plannedCircuit(facts: { status: string; source: string; purchaseLamports: bigint }): { lamports: bigint; stampsFunded: number } | null {
  if (facts.status !== 'paid' || facts.source !== 'payment') return null;
  const lamports = circuitShare(facts.purchaseLamports);
  return lamports > 0n ? { lamports, stampsFunded: stampsFunded(lamports) } : null;
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
