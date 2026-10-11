import { EscrowProgramError, readEscrow, refundPlan, releasePlan, acceptPlan, matchesTerms, sendAsApprover, type EscrowTerms } from './bounty-chain.ts';
import { escrowBalance, sendFromEscrow } from './bounty-escrow.ts';
import {
  checkEligibility,
  drainLamports,
  fundingTarget,
  transferMemo,
  transferStep,
  type BountyRow,
  type BountyStatus,
  type ClaimRow,
  type Eligibility,
  type EventRow,
} from './bounty.ts';
import { readAssets } from './chain-read.ts';
import { loadConfig, type IteraClient } from './db.ts';
import { findPayment, type SignatureInfo } from './gift.ts';
import { BASE_FEE_LAMPORTS } from './purchase-verify.ts';
import { rpc } from './rpc.ts';
import { TransferBroadcastError, signatureFate, treasuryAddress } from './treasury.ts';

export const BOUNTY_COLUMNS =
  'id,slug,tenant_id,sponsor_name,title_i18n,summary_i18n,brief_i18n,deliverable_i18n,requirement,reward_lamports,escrow_kind,escrow_address,refund_address,status,claim_id,claim_hours,expires_at,funded_at,funded_lamports,funding_signature,transfer_signature,transfer_sent_at,transfer_lamports,paid_at,paid_wallet,payout_lamports,payout_signature,refunded_at,refund_lamports,refund_signature,created_at';
export const CLAIM_COLUMNS =
  'id,bounty_id,user_id,wallet,proof_asset,proof,status,accepted_at,deadline_at,submission_url,submission_note,submitted_at,reviewed_at,review_note';
const EVENT_COLUMNS = 'id,bounty_id,kind,wallet,lamports,signature,created_at';
const BOARD_LIMIT = 60;
const EVENT_LIMIT = 60;
const ESCROW_HISTORY = 20;
const CERTIFICATION_LIMIT = 20;

/** The public board, or every bounty of the given tenants (a sponsor's own, test rows included). */
export async function listBounties(db: IteraClient, tenantIds?: string[]): Promise<BountyRow[]> {
  const query = db.from('bounties').select(BOUNTY_COLUMNS).order('created_at', { ascending: false }).limit(BOARD_LIMIT);
  // A sponsor keeps seeing a test row while it is live, so an automated run can be driven from the console; closed ones only add noise.
  const { data, error } = await (tenantIds ? query.in('tenant_id', tenantIds).or('is_test.eq.false,status.not.in.(paid,refunded)') : query.eq('is_test', false));
  if (error) throw new Error(`bounties: ${error.message}`);
  return (data ?? []) as unknown as BountyRow[];
}

/** One bounty by id or slug. */
export async function loadBounty(db: IteraClient, key: { id: string } | { slug: string }): Promise<BountyRow | null> {
  const query = db.from('bounties').select(BOUNTY_COLUMNS);
  const { data, error } = await ('id' in key ? query.eq('id', key.id) : query.eq('slug', key.slug)).maybeSingle();
  if (error) throw new Error(`bounty: ${error.message}`);
  return data as unknown as BountyRow | null;
}

export async function loadClaims(db: IteraClient, claimIds: string[]): Promise<Map<string, ClaimRow>> {
  if (claimIds.length === 0) return new Map();
  const { data, error } = await db.from('bounty_claims').select(CLAIM_COLUMNS).in('id', claimIds);
  if (error) throw new Error(`bounty_claims: ${error.message}`);
  return new Map(((data ?? []) as unknown as ClaimRow[]).map((claim) => [claim.id, claim]));
}

export async function loadEvents(db: IteraClient, bountyId: string): Promise<EventRow[]> {
  const { data, error } = await db.from('bounty_events').select(EVENT_COLUMNS).eq('bounty_id', bountyId).order('id').limit(EVENT_LIMIT);
  if (error) throw new Error(`bounty_events: ${error.message}`);
  return (data ?? []) as EventRow[];
}

/** The claim a learner currently holds (taken or delivered), on any bounty. */
export async function openClaimOf(db: IteraClient, userId: string): Promise<ClaimRow | null> {
  const { data, error } = await db.from('bounty_claims').select(CLAIM_COLUMNS).eq('user_id', userId).in('status', ['active', 'submitted']).maybeSingle();
  if (error) throw new Error(`bounty_claims: ${error.message}`);
  return data as unknown as ClaimRow | null;
}

async function mark(
  db: IteraClient,
  bountyId: string,
  from: BountyStatus[],
  to: BountyStatus,
  detail: { wallet?: string | null; lamports?: bigint | null; signature?: string | null } = {},
): Promise<boolean> {
  const { data, error } = await db.rpc('bounty_mark', {
    p_bounty: bountyId,
    p_from: from,
    p_to: to,
    p_wallet: detail.wallet ?? null,
    p_lamports: detail.lamports === null || detail.lamports === undefined ? null : Number(detail.lamports),
    p_signature: detail.signature ?? null,
  });
  if (error) throw new Error(`bounty_mark: ${error.message}`);
  return data === true;
}

function escrowHistory(address: string): Promise<SignatureInfo[]> {
  return rpc<SignatureInfo[]>('getSignaturesForAddress', [address, { limit: ESCROW_HISTORY, commitment: 'confirmed' }]);
}

/** The terms a program-held bounty must show on chain. `null` when the program is not configured. */
export async function escrowTerms(bounty: BountyRow, config: Record<string, string>): Promise<EscrowTerms | null> {
  if (!config.bounty_escrow_program || !config.collection_passports) return null;
  return {
    programId: config.bounty_escrow_program,
    escrow: bounty.escrow_address,
    approver: await treasuryAddress(),
    sponsor: bounty.refund_address,
    collection: config.collection_passports,
    bountyId: bounty.id,
    amount: BigInt(bounty.reward_lamports),
    expiresAt: Math.floor(Date.parse(bounty.expires_at) / 1000),
  };
}

/** What the chain holds for a bounty that is waiting for money: the lamports locked, or `null` when it is not funded yet. */
async function lockedLamports(db: IteraClient, bounty: BountyRow): Promise<bigint | null> {
  if (bounty.escrow_kind === 'program') {
    const terms = await escrowTerms(bounty, await loadConfig(db));
    if (!terms) return null;
    const state = await readEscrow(terms.programId, bounty.escrow_address);
    // An account someone created with other terms (another approver, another destination) is not this bounty's escrow.
    return state?.status === 'open' && matchesTerms(state, terms) ? state.amount : null;
  }
  const balance = await escrowBalance(bounty.escrow_address);
  return balance >= fundingTarget(bounty.reward_lamports) ? balance : null;
}

/**
 * Opens a bounty whose escrow holds the reward. The chain decides: whoever
 * paid, and through whichever client, the bounty opens when the money is
 * there. Returns the bounty as it stands afterwards.
 */
export async function refreshFunding(db: IteraClient, bounty: BountyRow, known?: { wallet: string; signature: string }): Promise<BountyRow> {
  if (bounty.status !== 'awaiting_funding') return bounty;
  const locked = await lockedLamports(db, bounty);
  if (locked === null) return bounty;
  let signature = known?.signature ?? null;
  if (!signature) {
    const history = await escrowHistory(bounty.escrow_address).catch(() => [] as SignatureInfo[]);
    signature = history.filter((entry) => entry.err === null).at(-1)?.signature ?? null;
  }
  await mark(db, bounty.id, ['awaiting_funding'], 'open', { wallet: known?.wallet ?? null, lamports: locked, signature });
  return (await loadBounty(db, { id: bounty.id })) ?? bounty;
}

/**
 * Records a claim on the escrow program, which checks the certification account
 * itself. Returns the signature, or `null` when the account already names this
 * wallet. Throws `EscrowProgramError` when the program refuses.
 */
export async function acceptOnChain(db: IteraClient, bounty: BountyRow, claim: { id: string; wallet: string; proofAsset: string }): Promise<string | null> {
  const terms = await escrowTerms(bounty, await loadConfig(db));
  if (!terms) throw new EscrowProgramError('not_configured');
  const state = await readEscrow(terms.programId, bounty.escrow_address);
  if (!state) throw new EscrowProgramError('wrong_escrow_account');
  const plan = acceptPlan(state, terms, claim.wallet, claim.proofAsset);
  if (plan === 'held') return null;
  if (plan === 'closed') throw new EscrowProgramError('not_open');
  const signature = await sendAsApprover(plan, transferMemo(bounty.id, 'accept'));
  const { error } = await db.from('bounty_events').update({ signature }).eq('bounty_id', bounty.id).eq('claim_id', claim.id).eq('kind', 'accepted');
  if (error) console.error('bounty accept signature not recorded', bounty.id, signature, error.message);
  return signature;
}

/** Hands a bounty whose learner ran out of time back to the board. Never throws. */
export async function expireStaleClaims(db: IteraClient, bounties: BountyRow[], claims: Map<string, ClaimRow>, now: Date): Promise<boolean> {
  let changed = false;
  for (const bounty of bounties) {
    const claim = bounty.claim_id ? claims.get(bounty.claim_id) : undefined;
    if (bounty.status !== 'claimed' || !claim || Date.parse(claim.deadline_at) > now.getTime()) continue;
    const { data, error } = await db.rpc('bounty_release_claim', { p_bounty: bounty.id, p_reason: 'expired', p_user_id: null });
    if (error) console.error('bounty expire failed', error.message);
    else if (data === 'ok') changed = true;
  }
  return changed;
}

/**
 * The certifications of a wallet, read from chain. Our tables are used only as
 * an index of which accounts to read; nothing they say about an asset decides.
 */
export async function eligibilityOf(db: IteraClient, wallet: string | null, bounty: BountyRow, config: Record<string, string>): Promise<Eligibility> {
  if (!wallet) return checkEligibility({ wallet, requirement: bounty.requirement, assets: [], collection: undefined, authority: undefined });
  const { data, error } = await db
    .from('user_achievements')
    .select('asset_address')
    .eq('wallet_address', wallet)
    .eq('achievement_key', 'trail_pass')
    .not('asset_address', 'is', null)
    .limit(CERTIFICATION_LIMIT);
  if (error) throw new Error(`user_achievements: ${error.message}`);
  const addresses = [...new Set<string>((data ?? []).map((row) => String(row.asset_address)))];
  const onchain = config.collection_passports ? await readAssets(addresses, [config.collection_passports]) : new Map();
  return checkEligibility({
    wallet,
    requirement: bounty.requirement,
    assets: [...onchain.values()],
    collection: config.collection_passports,
    authority: config.authority,
  });
}

export type TransferOutcome = 'settled' | 'pending' | 'stuck';

/** Only the request that still sees the row as it read it may send. */
async function takeLease(db: IteraClient, bounty: BountyRow): Promise<boolean> {
  let lease = db
    .from('bounties')
    .update({ transfer_sent_at: new Date().toISOString(), transfer_signature: null, transfer_lamports: null })
    .eq('id', bounty.id)
    .eq('status', bounty.status);
  lease = bounty.transfer_signature ? lease.eq('transfer_signature', bounty.transfer_signature) : lease.is('transfer_signature', null);
  lease = bounty.transfer_sent_at ? lease.eq('transfer_sent_at', bounty.transfer_sent_at) : lease.is('transfer_sent_at', null);
  const leased = await lease.select('id');
  if (leased.error) throw new Error(`bounty lease: ${leased.error.message}`);
  return (leased.data ?? []).length > 0;
}

/** Nothing was sent: the lease goes back so the next request can try at once. */
async function dropLease(db: IteraClient, bounty: BountyRow): Promise<void> {
  await db.from('bounties').update({ transfer_sent_at: null }).eq('id', bounty.id).eq('status', bounty.status).is('transfer_signature', null);
}

function recordBroadcast(db: IteraClient, bounty: BountyRow, lamports: bigint) {
  return async (sent: string) => {
    const { error } = await db.from('bounties').update({ transfer_signature: sent, transfer_lamports: Number(lamports) }).eq('id', bounty.id).eq('status', bounty.status);
    if (error) console.error('bounty transfer signature not recorded', bounty.id, sent, error.message);
  };
}

interface Transfer {
  bounty: BountyRow;
  done: BountyStatus;
  memo: string;
  recipient: string;
  claim: ClaimRow | null;
}

/** A server-held escrow account: one transfer that empties it. */
async function sendFromAccount(db: IteraClient, transfer: Transfer): Promise<TransferOutcome> {
  const { bounty, done, memo, recipient } = transfer;
  const lamports = drainLamports(await escrowBalance(bounty.escrow_address));
  if (lamports === null) {
    // Nothing left to send. Either an earlier transfer of ours emptied the account, or it never held anything.
    const earlier = findPayment(await escrowHistory(bounty.escrow_address), memo);
    if (earlier) {
      await mark(db, bounty.id, [bounty.status], done, { wallet: recipient, lamports: BigInt(bounty.funded_lamports ?? bounty.reward_lamports) - BASE_FEE_LAMPORTS, signature: earlier });
      return 'settled';
    }
    if (done === 'refunded') {
      await mark(db, bounty.id, ['refunding'], 'refunded', { wallet: recipient, lamports: 0n, signature: null });
      return 'settled';
    }
    console.error('bounty payout stuck: empty escrow with no payout on chain', bounty.id);
    return 'stuck';
  }
  const signature = await sendFromEscrow({ bountyId: bounty.id, expectedAddress: bounty.escrow_address, recipient, lamports, memo, onBroadcast: recordBroadcast(db, bounty, lamports) });
  await mark(db, bounty.id, [bounty.status], done, { wallet: recipient, lamports, signature });
  return 'settled';
}

/** A program-held escrow: the program moves the money, and its account says what already happened. */
async function sendThroughProgram(db: IteraClient, transfer: Transfer): Promise<TransferOutcome> {
  const { bounty, done, memo, recipient, claim } = transfer;
  const terms = await escrowTerms(bounty, await loadConfig(db));
  if (!terms) return 'stuck';
  const state = await readEscrow(terms.programId, bounty.escrow_address);
  if (!state) {
    if (done !== 'refunded') return 'stuck';
    await mark(db, bounty.id, ['refunding'], 'refunded', { wallet: recipient, lamports: 0n, signature: null });
    return 'settled';
  }
  const plan = claim ? releasePlan(state, terms, claim.wallet, claim.proof_asset) : refundPlan(state, terms);
  if (plan === 'closed') {
    console.error('bounty transfer stuck: the escrow account is closed another way', bounty.id, state.status);
    return 'stuck';
  }
  if (plan === 'done') {
    const signature = findPayment(await escrowHistory(bounty.escrow_address), memo);
    await mark(db, bounty.id, [bounty.status], done, { wallet: recipient, lamports: state.amount, signature });
    return 'settled';
  }
  const signature = await sendAsApprover(plan, memo, recordBroadcast(db, bounty, state.amount));
  await mark(db, bounty.id, [bounty.status], done, { wallet: recipient, lamports: state.amount, signature });
  return 'settled';
}

/**
 * Finishes the transfer a bounty is waiting on: the payout of a `paying` one
 * (to the wallet of its approved claim) or the refund of a `refunding` one (to
 * the sponsor's refund address). Safe to call any number of times, from any
 * number of requests: one request at a time holds the lease, a signature that
 * may still land is never sent again, and the chain itself refuses a second
 * transfer (an emptied account, or the program's own status).
 */
export async function settleTransfer(db: IteraClient, bountyId: string): Promise<TransferOutcome> {
  const bounty = await loadBounty(db, { id: bountyId });
  if (!bounty) return 'stuck';
  if (bounty.status === 'paid' || bounty.status === 'refunded') return 'settled';
  if (bounty.status !== 'paying' && bounty.status !== 'refunding') return 'stuck';
  const paying = bounty.status === 'paying';
  const done: BountyStatus = paying ? 'paid' : 'refunded';
  const memo = transferMemo(bounty.id, paying ? 'payout' : 'refund');

  let recipient = bounty.refund_address;
  let claim: ClaimRow | null = null;
  if (paying) {
    claim = (bounty.claim_id ? (await loadClaims(db, [bounty.claim_id])).get(bounty.claim_id) : undefined) ?? null;
    if (!claim || claim.status !== 'approved') return 'stuck';
    recipient = claim.wallet;
  }

  const fate = bounty.transfer_signature ? await signatureFate(bounty.transfer_signature) : null;
  const step = transferStep({ signature: bounty.transfer_signature, fate, sentAt: bounty.transfer_sent_at, now: new Date() });
  if (step === 'wait') return 'pending';
  if (step === 'settled') {
    await mark(db, bounty.id, [bounty.status], done, { wallet: recipient, lamports: BigInt(bounty.transfer_lamports ?? 0), signature: bounty.transfer_signature });
    return 'settled';
  }
  if (!(await takeLease(db, bounty))) return 'pending';

  const transfer: Transfer = { bounty, done, memo, recipient, claim };
  try {
    return await (bounty.escrow_kind === 'program' ? sendThroughProgram(db, transfer) : sendFromAccount(db, transfer));
  } catch (error) {
    if (error instanceof TransferBroadcastError) {
      console.error('bounty transfer not confirmed', bounty.id, error.signature, error.message);
      return 'pending';
    }
    await dropLease(db, bounty);
    if (error instanceof EscrowProgramError) {
      console.error('bounty transfer refused by the escrow program', bounty.id, error.code);
      return 'stuck';
    }
    throw error;
  }
}

/** Starts the refund of a bounty nobody is working on, and tries to finish it. */
export async function refundBounty(db: IteraClient, bounty: BountyRow, actorWallet: string | null): Promise<TransferOutcome | 'not_refundable'> {
  if (bounty.status !== 'refunding') {
    const started = await mark(db, bounty.id, ['awaiting_funding', 'open'], 'refunding', { wallet: actorWallet });
    if (!started) return 'not_refundable';
  }
  return settleTransfer(db, bounty.id);
}

/** Lets work outlive the response. Its failure is logged, never thrown. */
export function inBackground(work: Promise<unknown>): void {
  const guarded = work.catch((error) => console.error('bounty background work failed', error));
  (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(guarded);
}

/**
 * Returns the money of bounties nobody finished in time: past `expires_at` and
 * held by no one, or a refund that was started and never confirmed. Anyone may
 * set this off (a reader of the board, the scheduler): the destination is the
 * refund address fixed when the bounty was posted, whoever asks. Never throws;
 * answers how many it took on.
 */
export async function sweepExpired(db: IteraClient, now: Date, max: number): Promise<number> {
  try {
    const { data, error } = await db
      .from('bounties')
      .select(BOUNTY_COLUMNS)
      .or(`and(status.in.(open,awaiting_funding),expires_at.lte.${now.toISOString()}),status.eq.refunding`)
      .order('expires_at')
      .limit(max);
    if (error) throw new Error(`bounties sweep: ${error.message}`);
    const due = (data ?? []) as unknown as BountyRow[];
    for (const bounty of due) {
      try {
        const outcome = await refundBounty(db, bounty, null);
        console.log('bounty sweep', bounty.slug, outcome);
      } catch (error) {
        console.error('bounty sweep failed', bounty.slug, error instanceof Error ? error.message : error);
      }
    }
    return due.length;
  } catch (error) {
    console.error('bounty sweep failed', error instanceof Error ? error.message : error);
    return 0;
  }
}

/** Which of these payout signatures the chain confirms, in one call. */
export async function landedSignatures(signatures: string[]): Promise<Set<string>> {
  if (signatures.length === 0) return new Set();
  const { value } = await rpc<{ value: Array<{ err: unknown; confirmationStatus?: string } | null> }>('getSignatureStatuses', [
    signatures.slice(0, 256),
    { searchTransactionHistory: true },
  ]);
  return new Set(
    signatures.filter((_, index) => {
      const status = value[index];
      return status && !status.err && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized');
    }),
  );
}
