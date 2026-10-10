import { circuitDecision, circuitMemo, stampsFunded } from './circuit.ts';
import { inBackground } from './companion-store.ts';
import { explorerUrl } from './credential.ts';
import type { IteraClient } from './db.ts';
import { balanceOf } from './rpc.ts';
import { sendToAuthority, treasuryAddress } from './treasury.ts';

const COLUMNS = 'id,status,source,lamports,circuit_status,circuit_lamports,circuit_signature,circuit_at';

interface CircuitRow {
  id: string;
  status: string;
  source: string;
  lamports: number;
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

function view(row: CircuitRow): CircuitView | null {
  if (!row.circuit_status) return null;
  const lamports = row.circuit_status === 'sent' ? BigInt(row.circuit_lamports ?? 0) : 0n;
  return {
    status: row.circuit_status,
    lamports: Number(lamports),
    stamps_funded: stampsFunded(lamports),
    tx_signature: row.circuit_signature,
    explorer_url: explorerUrl('tx', row.circuit_signature),
  };
}

async function record(db: IteraClient, purchaseId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db.from('purchases').update({ ...patch, circuit_at: new Date().toISOString() }).eq('id', purchaseId).eq('circuit_status', 'pending');
  if (error) throw new Error(`purchases circuit record: ${error.message}`);
}

/**
 * Moves a paid purchase's share to the mint authority, once. Nothing here
 * comes from a request: the amount is derived from the lamports stored on the
 * paid row, and the destination is fixed in `sendToAuthority`. The row is
 * taken with a compare-and-set before anything is sent and is never taken
 * again, so a purchase moves at most one transfer; a transfer that may have
 * been broadcast and then failed stays `failed` rather than being sent twice.
 */
export async function payCircuit(db: IteraClient, purchaseId: string): Promise<CircuitView | null> {
  const before = await load(db, purchaseId);
  if (!before || before.status !== 'paid' || before.source !== 'payment') return null;
  if (before.circuit_status) return view(before);

  const { data: claimed, error: claimError } = await db
    .from('purchases')
    .update({ circuit_status: 'pending', circuit_at: new Date().toISOString() })
    .eq('id', purchaseId)
    .eq('status', 'paid')
    .eq('source', 'payment')
    .is('circuit_status', null)
    .select(COLUMNS);
  if (claimError) throw new Error(`purchases circuit claim: ${claimError.message}`);
  const row = ((claimed ?? []) as CircuitRow[])[0];
  if (!row) {
    const current = await load(db, purchaseId);
    return current ? view(current) : null;
  }

  let treasuryBalance: bigint;
  try {
    treasuryBalance = await balanceOf(await treasuryAddress());
  } catch (error) {
    // Nothing was sent: the claim is let go so a later confirm of the same purchase can try.
    console.error('circuit: treasury balance unavailable', error instanceof Error ? error.message : error);
    await db.from('purchases').update({ circuit_status: null, circuit_at: null }).eq('id', purchaseId).eq('circuit_status', 'pending');
    return null;
  }

  const decision = circuitDecision({ status: row.status, source: row.source, purchaseLamports: BigInt(row.lamports), treasuryBalance });
  if (decision.action === 'skip') {
    await record(db, purchaseId, { circuit_status: 'skipped', circuit_reason: decision.reason });
    return view({ ...row, circuit_status: 'skipped' });
  }
  try {
    const signature = await sendToAuthority({ lamports: decision.lamports, memo: circuitMemo(purchaseId) });
    await record(db, purchaseId, { circuit_status: 'sent', circuit_lamports: Number(decision.lamports), circuit_signature: signature, circuit_reason: null });
    return view({ ...row, circuit_status: 'sent', circuit_lamports: Number(decision.lamports), circuit_signature: signature });
  } catch (error) {
    console.error(`circuit: transfer for purchase ${purchaseId} failed`, error);
    await record(db, purchaseId, { circuit_status: 'failed', circuit_reason: String(error instanceof Error ? error.message : error).slice(0, 200) });
    return view({ ...row, circuit_status: 'failed' });
  }
}

/** `payCircuit` with a time budget for a response: past it the transfer goes on in the background and the answer says `pending`. Never throws. */
export async function circuitWithin(db: IteraClient, purchaseId: string, budgetMs: number): Promise<CircuitView | null> {
  const work = payCircuit(db, purchaseId).catch((error) => {
    console.error('circuit failed', error);
    return null;
  });
  inBackground(work);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => resolve('late'), budgetMs);
  });
  const result = await Promise.race([work, late]);
  clearTimeout(timer);
  return result === 'late' ? { status: 'pending', lamports: 0, stamps_funded: 0, tx_signature: null, explorer_url: null } : result;
}

/** What a wallet's own purchases sent through the circuit. */
export async function walletCircuit(db: IteraClient, wallet: string): Promise<{ lamports: number; stamps_funded: number }> {
  const { data, error } = await db.from('purchases').select('circuit_lamports').eq('wallet', wallet).eq('circuit_status', 'sent');
  if (error) throw new Error(`purchases circuit wallet: ${error.message}`);
  const total = (data ?? []).reduce((sum, row) => sum + BigInt(row.circuit_lamports ?? 0), 0n);
  return { lamports: Number(total), stamps_funded: stampsFunded(total) };
}
