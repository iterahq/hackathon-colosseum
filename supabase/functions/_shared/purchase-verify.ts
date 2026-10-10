import { MEMO_PROGRAMS } from './solana-tx.ts';

/** Fee of a one-signature transaction and the smallest balance a system account may keep. */
export const BASE_FEE_LAMPORTS = 5_000n;
export const RENT_EXEMPT_MIN_LAMPORTS = 890_880n;
/** A paid transaction can be confirmed long after its intent's blockhash died. */
export const CONFIRM_GRACE_MS = 24 * 60 * 60 * 1000;
const MS_PER_BLOCK = 400;

export type MismatchDetail = 'payer' | 'destination' | 'amount' | 'memo';

export type PaymentVerdict =
  | { ok: true; paidLamports: bigint }
  | { ok: false; error: 'tx_failed' }
  | { ok: false; error: 'payment_mismatch'; detail: MismatchDetail };

export interface PaymentExpectation {
  wallet: string;
  treasury: string;
  lamports: bigint;
  memo: string;
}

/** The subset of an RPC `getTransaction` (encoding `jsonParsed`) result that is read here. */
export interface ParsedTransaction {
  meta: { err: unknown } | null;
  transaction: {
    message: {
      accountKeys: Array<{ pubkey: string; signer?: boolean } | string>;
      instructions: Array<{ program?: string; programId?: string; parsed?: unknown }>;
    };
  };
}

type Instruction = ParsedTransaction['transaction']['message']['instructions'][number];

/** A memo instruction, whether or not the node could read its text. */
function isMemo(instruction: Instruction): boolean {
  return instruction.program === 'spl-memo' || (typeof instruction.programId === 'string' && MEMO_PROGRAMS.has(instruction.programId));
}

function toLamports(value: unknown): bigint | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  if (typeof value === 'string' && /^\d{1,20}$/.test(value)) return BigInt(value);
  return null;
}

function transfersOf(tx: ParsedTransaction): Array<{ source: string; destination: string; lamports: bigint }> {
  const transfers = [];
  for (const instruction of tx.transaction.message.instructions) {
    if (instruction.program !== 'system' || !instruction.parsed || typeof instruction.parsed !== 'object') continue;
    const { type, info } = instruction.parsed as { type?: unknown; info?: Record<string, unknown> };
    if (type !== 'transfer' || !info) continue;
    const lamports = toLamports(info.lamports);
    if (typeof info.source !== 'string' || typeof info.destination !== 'string' || lamports === null) continue;
    transfers.push({ source: info.source, destination: info.destination, lamports });
  }
  return transfers;
}

/**
 * Decides whether a confirmed transaction pays an intent: it succeeded, the
 * learner's wallet paid the fee and funded System transfers of at least the
 * price to the treasury, and its ONLY memo instruction is exactly the intent
 * id. A transaction with two memos pays nothing: one payment names one intent.
 * Other extra instructions (a wallet adding a priority fee) are tolerated.
 */
export function verifyPayment(tx: ParsedTransaction, expected: PaymentExpectation): PaymentVerdict {
  if (!tx.meta || tx.meta.err !== null) return { ok: false, error: 'tx_failed' };
  const mismatch = (detail: MismatchDetail): PaymentVerdict => ({ ok: false, error: 'payment_mismatch', detail });

  const first = tx.transaction.message.accountKeys[0];
  const feePayer = typeof first === 'string' ? first : first?.pubkey;
  if (feePayer !== expected.wallet) return mismatch('payer');

  const fromWallet = transfersOf(tx).filter((transfer) => transfer.source === expected.wallet);
  if (fromWallet.length === 0) return mismatch('payer');
  const toTreasury = fromWallet.filter((transfer) => transfer.destination === expected.treasury);
  if (toTreasury.length === 0) return mismatch('destination');
  const paidLamports = toTreasury.reduce((sum, transfer) => sum + transfer.lamports, 0n);
  if (paidLamports < expected.lamports) return mismatch('amount');

  const memos = tx.transaction.message.instructions.filter(isMemo);
  if (memos.length !== 1 || memos[0].parsed !== expected.memo) return mismatch('memo');

  return { ok: true, paidLamports };
}

export interface IntentTiming {
  status: string;
  expiresAt: string;
}

/** `confirmable` while a payment for the intent may still be accepted. */
export function intentPhase(intent: IntentTiming, now: Date, graceMs = CONFIRM_GRACE_MS): 'paid' | 'confirmable' | 'expired' {
  if (intent.status === 'paid') return 'paid';
  if (intent.status !== 'pending' && intent.status !== 'expired') return 'expired';
  return now.getTime() <= new Date(intent.expiresAt).getTime() + graceMs ? 'confirmable' : 'expired';
}

/**
 * The transaction is not visible. Past the blockhash's last valid block it never
 * will be, so the intent is dead; before that the client should simply ask again.
 */
export function missingTransactionVerdict(blockHeight: number, lastValidBlockHeight: number | null): 'tx_not_found' | 'intent_expired' {
  return lastValidBlockHeight !== null && blockHeight > lastValidBlockHeight ? 'intent_expired' : 'tx_not_found';
}

/** When the blockhash behind an intent stops being accepted, estimated from block heights. */
export function expiresAt(now: Date, blockHeight: number, lastValidBlockHeight: number): string {
  const blocksLeft = Math.max(0, lastValidBlockHeight - blockHeight);
  return new Date(now.getTime() + blocksLeft * MS_PER_BLOCK).toISOString();
}

/**
 * Whether the wallet can pay the price and the fee. A system account must end
 * either empty or rent exempt, so a balance that would leave dust is refused too.
 */
export function fundsCheck(balance: bigint, price: bigint): { ok: boolean; required: bigint } {
  const spend = price + BASE_FEE_LAMPORTS;
  const left = balance - spend;
  return { ok: left === 0n || left >= RENT_EXEMPT_MIN_LAMPORTS, required: spend + RENT_EXEMPT_MIN_LAMPORTS };
}
