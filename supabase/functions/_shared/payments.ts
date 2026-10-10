import type { IteraClient } from './db.ts';

/** What `itera.settle_payment` answers (migration 0132). */
export type LedgerVerdict = 'settled' | 'signature_reused' | 'already_paid' | 'not_payable' | 'not_found';
const VERDICTS: ReadonlySet<string> = new Set(['settled', 'signature_reused', 'already_paid', 'not_payable', 'not_found']);

export function asLedgerVerdict(value: unknown): LedgerVerdict {
  if (typeof value === 'string' && VERDICTS.has(value)) return value as LedgerVerdict;
  throw new Error(`settle_payment: unexpected answer ${JSON.stringify(value)}`);
}

/**
 * Marks an intent paid by a signature, through the one ledger shared by
 * purchases and gifts: the ledger entry and the intent's `paid` are written in
 * a single database transaction, and a signature settles one intent for ever.
 */
export async function settlePayment(db: IteraClient, kind: 'purchase' | 'gift', refId: string, signature: string, lamports: number): Promise<LedgerVerdict> {
  const { data, error } = await db.rpc('settle_payment', { p_kind: kind, p_ref_id: refId, p_signature: signature, p_lamports: lamports });
  if (error) throw new Error(`settle_payment: ${error.message}`);
  return asLedgerVerdict(data);
}

/** True when the signature already settled an intent other than `refId`. A cheap refusal before any chain lookup. */
export async function settledElsewhere(db: IteraClient, signature: string, refId: string): Promise<boolean> {
  const { data, error } = await db.from('payments').select('ref_id').eq('tx_signature', signature).maybeSingle();
  if (error) throw new Error(`payments: ${error.message}`);
  return data !== null && data.ref_id !== refId;
}
