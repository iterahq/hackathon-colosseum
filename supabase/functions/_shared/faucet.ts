/** The devnet faucet's rules (security review, finding 7). Lamports are `bigint`. */
export const DROP_LAMPORTS = 10_000_000n;
/** What the treasury gives away in any 24 hours: 0.3 SOL, thirty claims. */
export const DAILY_BUDGET_LAMPORTS = 300_000_000n;
export const MAX_CLAIMS = 200;
/**
 * A claim that was not seen confirmed is looked at again only after this long:
 * well past the life of a blockhash, so a transfer the chain does not have by
 * then can never land and sending a new one cannot pay twice.
 */
export const RETRY_AFTER_MS = 3 * 60_000;

/** Whether one more drop fits in what was given in the last 24 hours. */
export function withinDailyBudget(givenLast24h: bigint, drop = DROP_LAMPORTS, budget = DAILY_BUDGET_LAMPORTS): boolean {
  return givenLast24h >= 0n && givenLast24h + drop <= budget;
}

export interface ClaimRow {
  wallet: string;
  user_id: string;
  tx_signature: string | null;
  created_at: string;
  confirmed_at: string | null;
}

export type ClaimStep =
  /** Nobody claimed for this learner or this wallet: take the lock and send. */
  | 'send'
  | 'already_claimed'
  /** This wallet's own claim was never seen confirmed and is old enough: ask the chain about its signature. */
  | 'check_chain';

/**
 * What a call does given the claim rows that mention the caller's learner or
 * wallet (at most two: one per key). One confirmed claim, or a claim of the
 * same learner with another wallet, or of the wallet by another learner, ends
 * it: one claim per learner AND per wallet.
 */
export function claimStep(rows: readonly ClaimRow[], caller: { wallet: string; userId: string }, now: Date): ClaimStep {
  if (rows.length === 0) return 'send';
  const own = rows.find((row) => row.wallet === caller.wallet && row.user_id === caller.userId);
  if (!own || rows.length > 1 || own.confirmed_at) return 'already_claimed';
  return now.getTime() - new Date(own.created_at).getTime() >= RETRY_AFTER_MS ? 'check_chain' : 'already_claimed';
}

/**
 * After the chain was asked about an unconfirmed claim's signature (`null`:
 * no signature was ever stored, nothing left the treasury).
 * `confirm`: it landed, the claim is done. `wait`: still in flight.
 * `resend`: the chain has no successful transfer and never will.
 */
export function unconfirmedStep(fate: 'landed' | 'failed' | 'in_flight' | 'unknown' | null): 'confirm' | 'wait' | 'resend' {
  if (fate === 'landed') return 'confirm';
  if (fate === 'in_flight') return 'wait';
  return 'resend';
}

/** The memo of a faucet transfer: the wallet it pays, never an internal id. */
export function faucetMemo(wallet: string): string {
  return `faucet:${wallet}`;
}
