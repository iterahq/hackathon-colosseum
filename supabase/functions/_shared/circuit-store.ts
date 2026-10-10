import { NEVER_RAN_AFTER_MS, RESEND_AFTER_MS, RETRY_WINDOW_MS, circuitDecision, circuitMemo, circuitRetryDue, circuitShare, plannedCircuit, resumeStep, stampsFunded } from './circuit.ts';
import { explorerUrl } from './credential.ts';
import type { IteraClient } from './db.ts';
import { memoCarries, type SignatureInfo } from './gift.ts';
import { balanceOf, rpc } from './rpc.ts';
import { TransferBroadcastError, sendToAuthority, signatureFate, treasuryAddress, type SignatureFate } from './treasury.ts';

const COLUMNS = 'id,status,source,lamports,paid_at,circuit_status,circuit_lamports,circuit_signature,circuit_at';
/** How far back the treasury's history is searched for a transfer whose signature was not saved. */
const HISTORY_LIMIT = 1000;
const RETRY_BATCH = 2;

interface CircuitRow {
  id: string;
  status: string;
  source: string;
  lamports: number;
  paid_at: string | null;
  circuit_status: 'pending' | 'sent' | 'skipped' | 'failed' | null;
  circuit_lamports: number | null;
  circuit_signature: string | null;
  circuit_at: string | null;
}

export interface CircuitView {
  status: 'pending' | 'sent' | 'skipped' | 'failed';
  lamports: number;
  stamps_funded: number;
  tx_signature: string | null;
  explorer_url: string | null;
}

async function load(db: IteraClient, purchaseId: string): Promise<CircuitRow | null> {
  const { data, error } = await db.from('purchases').select(COLUMNS).eq('id', purchaseId).maybeSingle();
  if (error) throw new Error(`purchases circuit: ${error.message}`);
  return data as CircuitRow | null;
}

/**
 * The `circuit` block of a paid answer, from the row alone (no chain call).
 * `sent`: the confirmed transfer. Not sent yet (`pending`): what the purchase
 * WILL move, `floor(lamports / 2)` of the paid row, with no transaction yet;
 * the transfer runs after the response. `skipped` / `failed`: zero.
 */
function view(row: CircuitRow): CircuitView | null {
  if (row.circuit_status === 'sent') {
    const lamports = BigInt(row.circuit_lamports ?? 0);
    return { status: 'sent', lamports: Number(lamports), stamps_funded: stampsFunded(lamports), tx_signature: row.circuit_signature, explorer_url: explorerUrl('tx', row.circuit_signature) };
  }
  if (row.circuit_status === 'skipped' || row.circuit_status === 'failed') {
    return { status: row.circuit_status, lamports: 0, stamps_funded: 0, tx_signature: null, explorer_url: null };
  }
  const planned = plannedCircuit({ status: row.status, source: row.source, purchaseLamports: BigInt(row.lamports) });
  if (!planned) return null;
  return { status: 'pending', lamports: Number(planned.lamports), stamps_funded: planned.stampsFunded, tx_signature: null, explorer_url: null };
}

/** What a purchase answer says about its Circuito share. One database read, never waits for the chain. Never throws. */
export async function circuitPlan(db: IteraClient, purchaseId: string): Promise<CircuitView | null> {
  try {
    const row = await load(db, purchaseId);
    return row ? view(row) : null;
  } catch (error) {
    console.error('circuit plan failed', error);
    return null;
  }
}

async function record(db: IteraClient, purchaseId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db.from('purchases').update({ ...patch, circuit_at: new Date().toISOString() }).eq('id', purchaseId).eq('circuit_status', 'pending');
  if (error) throw new Error(`purchases circuit record: ${error.message}`);
}

/**
 * Sends the share of a row this invocation holds (`circuit_status = 'pending'`,
 * taken by compare-and-set) and records the outcome. The amount is derived
 * from the lamports stored on the paid row and the destination is fixed in
 * `sendToAuthority`: nothing here comes from a request. The signature is
 * saved the moment the node accepts the transaction, so a later retry can ask
 * the chain about it instead of paying twice.
 */
async function send(db: IteraClient, row: CircuitRow): Promise<void> {
  let treasuryBalance: bigint;
  try {
    treasuryBalance = await balanceOf(await treasuryAddress());
  } catch (error) {
    // Nothing was sent. The claim stays; the retry takes it again later.
    console.error('circuit: treasury balance unavailable', error instanceof Error ? error.message : error);
    return;
  }

  const decision = circuitDecision({ status: row.status, source: row.source, purchaseLamports: BigInt(row.lamports), treasuryBalance });
  if (decision.action === 'skip') {
    await record(db, row.id, { circuit_status: 'skipped', circuit_reason: decision.reason, circuit_signature: null, circuit_lamports: null });
    return;
  }
  const lamports = Number(decision.lamports);
  try {
    const signature = await sendToAuthority({
      lamports: decision.lamports,
      memo: circuitMemo(row.id),
      onBroadcast: (sent) => record(db, row.id, { circuit_signature: sent, circuit_lamports: lamports }),
    });
    await record(db, row.id, { circuit_status: 'sent', circuit_lamports: lamports, circuit_signature: signature, circuit_reason: null });
  } catch (error) {
    console.error(`circuit: transfer for purchase ${row.id} failed`, error);
    const reason = String(error instanceof Error ? error.message : error).slice(0, 200);
    // Broadcast and then lost sight of: keep the signature, the retry asks the chain. Otherwise nothing left the treasury.
    const patch = error instanceof TransferBroadcastError ? { circuit_status: 'failed', circuit_reason: reason } : { circuit_status: 'failed', circuit_reason: reason, circuit_signature: null, circuit_lamports: null };
    await record(db, row.id, patch);
  }
}

/**
 * Moves a paid purchase's share to the mint authority, once. The row is taken
 * with a compare-and-set (`null -> pending`) before anything is sent; a row
 * another invocation holds is left to it. Never throws.
 */
export async function payCircuit(db: IteraClient, purchaseId: string): Promise<void> {
  try {
    const { data: claimed, error } = await db
      .from('purchases')
      .update({ circuit_status: 'pending', circuit_at: new Date().toISOString() })
      .eq('id', purchaseId)
      .eq('status', 'paid')
      .eq('source', 'payment')
      .is('circuit_status', null)
      .select(COLUMNS);
    if (error) throw new Error(`purchases circuit claim: ${error.message}`);
    const row = ((claimed ?? []) as CircuitRow[])[0];
    if (row) await send(db, row);
  } catch (error) {
    console.error(`circuit for purchase ${purchaseId} failed`, error);
  }
}

/** A successful transaction of the treasury that carries this purchase's circuit memo, if the chain has one. */
async function findByMemo(purchaseId: string): Promise<string | null> {
  const recent = await rpc<SignatureInfo[]>('getSignaturesForAddress', [await treasuryAddress(), { limit: HISTORY_LIMIT, commitment: 'confirmed' }]);
  return recent.find((entry) => entry.err === null && memoCarries(entry.memo, circuitMemo(purchaseId)))?.signature ?? null;
}

/**
 * Takes up a transfer that was claimed earlier and is still `pending` or
 * `failed`: the claim is renewed by compare-and-set on its timestamp, then the
 * chain is asked whether the transfer already landed (the saved signature, or
 * any treasury transaction with the memo `circuit:<purchase id>`). Found: it is
 * recorded as sent. Still in flight: left alone. Otherwise, and only then, it
 * is sent again. If the chain cannot be asked, nothing is sent.
 */
async function resume(db: IteraClient, stale: CircuitRow): Promise<void> {
  let query = db
    .from('purchases')
    .update({ circuit_status: 'pending', circuit_at: new Date().toISOString() })
    .eq('id', stale.id)
    .eq('status', 'paid')
    .eq('source', 'payment')
    .eq('circuit_status', stale.circuit_status as string);
  query = stale.circuit_at ? query.eq('circuit_at', stale.circuit_at) : query.is('circuit_at', null);
  const { data: claimed, error } = await query.select(COLUMNS);
  if (error) throw new Error(`purchases circuit resume: ${error.message}`);
  const row = ((claimed ?? []) as CircuitRow[])[0];
  if (!row) return;

  let stored: SignatureFate | null = null;
  let byMemo: string | null = null;
  try {
    stored = row.circuit_signature ? await signatureFate(row.circuit_signature) : null;
    if (stored !== 'landed') byMemo = await findByMemo(row.id);
  } catch (error) {
    console.error(`circuit: could not ask the chain about purchase ${row.id}`, error instanceof Error ? error.message : error);
    return;
  }
  const step = resumeStep({ storedSignature: row.circuit_signature, stored, byMemo });
  if (step.action === 'wait') return;
  if (step.action === 'record') {
    await record(db, row.id, { circuit_status: 'sent', circuit_lamports: Number(circuitShare(BigInt(row.lamports))), circuit_signature: step.signature, circuit_reason: null });
    return;
  }
  await send(db, row);
}

/**
 * The retry for transfers that failed or never ran: at most `RETRY_BATCH`
 * purchases per call, oldest first. Runs after a purchase answer and on the
 * public `circuit` read. Never throws. Returns how many rows it took up.
 */
export async function retryCircuits(db: IteraClient, exceptId: string | null = null): Promise<number> {
  try {
    const now = new Date();
    const since = new Date(now.getTime() - RETRY_WINDOW_MS).toISOString();
    const neverRanBefore = new Date(now.getTime() - NEVER_RAN_AFTER_MS).toISOString();
    const staleBefore = new Date(now.getTime() - RESEND_AFTER_MS).toISOString();
    const { data, error } = await db
      .from('purchases')
      .select(COLUMNS)
      .eq('status', 'paid')
      .eq('source', 'payment')
      .gte('paid_at', since)
      .or(`and(circuit_status.is.null,paid_at.lt."${neverRanBefore}"),and(circuit_status.in.(pending,failed),circuit_at.lt."${staleBefore}")`)
      .order('paid_at')
      .limit(RETRY_BATCH + 1);
    if (error) throw new Error(`purchases circuit due: ${error.message}`);
    const due = ((data ?? []) as CircuitRow[])
      .filter((row) => row.id !== exceptId)
      .filter((row) => circuitRetryDue({ status: row.status, source: row.source, circuitStatus: row.circuit_status, paidAt: row.paid_at, circuitAt: row.circuit_at }, now))
      .slice(0, RETRY_BATCH);
    for (const row of due) {
      try {
        if (row.circuit_status === null) await payCircuit(db, row.id);
        else await resume(db, row);
      } catch (error) {
        console.error(`circuit retry for purchase ${row.id} failed`, error);
      }
    }
    return due.length;
  } catch (error) {
    console.error('circuit retry failed', error);
    return 0;
  }
}

/** After a purchase answer: this purchase's transfer, then a look at older ones that failed or never ran. Never throws. */
export async function settleCircuits(db: IteraClient, purchaseId: string): Promise<void> {
  await payCircuit(db, purchaseId);
  await retryCircuits(db, purchaseId);
}

/** What a wallet's own purchases sent through the circuit. */
export async function walletCircuit(db: IteraClient, wallet: string): Promise<{ lamports: number; stamps_funded: number }> {
  const { data, error } = await db.from('purchases').select('circuit_lamports').eq('wallet', wallet).eq('circuit_status', 'sent');
  if (error) throw new Error(`purchases circuit wallet: ${error.message}`);
  const total = (data ?? []).reduce((sum, row) => sum + BigInt(row.circuit_lamports ?? 0), 0n);
  return { lamports: Number(total), stamps_funded: stampsFunded(total) };
}
