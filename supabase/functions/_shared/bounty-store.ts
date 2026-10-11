import { EscrowProgramError, readEscrow, readEscrows, refundPlan, releasePlan, acceptPlan, matchesTerms, sendAsApprover, type EscrowTerms } from './bounty-chain.ts';
import { trailHash, unclaimInstruction, type EscrowGate, type EscrowState } from './bounty-program.ts';
import { memoInstruction, type Instruction } from './solana-message.ts';
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
  type Requirement,
} from './bounty.ts';
import { readAssets } from './chain-read.ts';
import { loadConfig, type IteraClient } from './db.ts';
import { findPayment, type SignatureInfo } from './gift.ts';
import { BASE_FEE_LAMPORTS } from './purchase-verify.ts';
import { rpc } from './rpc.ts';
import { TransferBroadcastError, signatureFate, treasuryAddress } from './treasury.ts';

export const BOUNTY_COLUMNS =
  'id,slug,tenant_id,sponsor_name,title_i18n,summary_i18n,brief_i18n,deliverable_i18n,requirement,reward_lamports,escrow_kind,escrow_address,refund_address,status,claim_id,claim_hours,expires_at,funded_at,funded_lamports,funding_signature,transfer_signature,transfer_sent_at,transfer_lamports,paid_at,paid_wallet,payout_lamports,payout_signature,refunded_at,refund_lamports,refund_signature,created_at,origin,sponsor_wallet,approver_address,slug_en,source_lang,hidden_at,hidden_reason,delivery_mirror_url,created_by,escrow_gated,auto_check,template_key';
export const CLAIM_COLUMNS =
  'id,bounty_id,user_id,wallet,proof_asset,proof,status,accepted_at,deadline_at,submission_url,submission_note,submitted_at,reviewed_at,review_note,submission_code,check_report';
const EVENT_COLUMNS = 'id,bounty_id,kind,wallet,lamports,signature,signer,created_at';
const BOARD_LIMIT = 60;
const EVENT_LIMIT = 60;
const ESCROW_HISTORY = 20;
const CERTIFICATION_LIMIT = 20;
const FRESH_CLAIM_MS = 90_000;

export const PROGRAM_SLUG = 'itera-v2';

export interface Trail {
  unit_id: string;
  title: Record<string, string>;
  total_days: number;
}

/** The trails a bounty can require stamped days of. */
export async function loadTrails(db: IteraClient): Promise<Trail[]> {
  const { data, error } = await db.from('units').select('id,title_i18n,ordinal,programs!inner(slug),lessons(count)').eq('programs.slug', PROGRAM_SLUG).order('ordinal');
  if (error) throw new Error(`units: ${error.message}`);
  return ((data ?? []) as unknown as Array<{ id: string; title_i18n: Record<string, string>; lessons: Array<{ count: number }> }>).map((unit) => ({
    unit_id: unit.id,
    title: unit.title_i18n,
    total_days: unit.lessons[0]?.count ?? 0,
  }));
}

/** The public board, or every bounty of the given tenants (a sponsor's own, test rows included). */
export async function listBounties(db: IteraClient, tenantIds?: string[]): Promise<BountyRow[]> {
  const query = db.from('bounties').select(BOUNTY_COLUMNS).order('created_at', { ascending: false }).limit(BOARD_LIMIT);
  // A sponsor keeps seeing a test row while it is live, so an automated run can be driven from the console; closed ones only add noise.
  // The public board: no test row, nothing moderation hid, and a wallet's bounty only once its money is locked.
  const { data, error } = await (tenantIds
    ? query.in('tenant_id', tenantIds).or('is_test.eq.false,status.not.in.(paid,refunded)')
    : query.eq('is_test', false).is('hidden_at', null).or('origin.eq.team,status.neq.awaiting_funding').or('template_key.is.null,status.in.(open,claimed,submitted,paying)'));
  if (error) throw new Error(`bounties: ${error.message}`);
  return (data ?? []) as unknown as BountyRow[];
}

/** One bounty by id or by either of its slugs. */
export async function loadBounty(db: IteraClient, key: { id: string } | { slug: string }): Promise<BountyRow | null> {
  const query = db.from('bounties').select(BOUNTY_COLUMNS);
  // The slug goes into a filter expression: only the shape a slug can have ever reaches it.
  if ('slug' in key && !/^[a-z0-9][a-z0-9-]{2,62}$/.test(key.slug)) return null;
  const { data, error } = await ('id' in key ? query.eq('id', key.id) : query.or(`slug.eq.${key.slug},slug_en.eq.${key.slug}`).limit(1)).maybeSingle();
  if (error) throw new Error(`bounty: ${error.message}`);
  return data as unknown as BountyRow | null;
}

/** The key the escrow program lets approve a bounty: the sponsor's wallet when it posted it, otherwise the Itera treasury key. */
export async function approverOf(bounty: Pick<BountyRow, 'approver_address'>): Promise<string> {
  return bounty.approver_address ?? (await treasuryAddress());
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
  const attester = await treasuryAddress();
  return {
    programId: config.bounty_escrow_program,
    escrow: bounty.escrow_address,
    approver: await approverOf(bounty),
    attester,
    sponsor: bounty.refund_address,
    collection: config.collection_passports,
    bountyId: bounty.id,
    amount: BigInt(bounty.reward_lamports),
    expiresAt: Math.floor(Date.parse(bounty.expires_at) / 1000),
    gate: bounty.escrow_gated ? await gateOf(bounty.requirement) : null,
  };
}

/** The gate a requirement becomes in an escrow account's terms. */
export async function gateOf(requirement: Pick<Requirement, 'program' | 'trail' | 'min_days'>): Promise<EscrowGate> {
  return { minDays: requirement.min_days, trail: await trailHash(requirement.program, requirement.trail) };
}

/** Whether the deployed program has gated escrows (`bounty_escrow_version` 3): every bounty posted from then on is one. */
export function gatedEscrows(config: Record<string, string>): boolean {
  return Number(config.bounty_escrow_version) >= 3;
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

/** Whether the wallet an escrow account names is one whose claim on this bounty our tables have already released, with no live one. */
async function isLeftoverClaim(db: IteraClient, bountyId: string, claimant: string | null): Promise<boolean> {
  if (!claimant) return false;
  const { data, error } = await db.from('bounty_claims').select('status').eq('bounty_id', bountyId).eq('wallet', claimant);
  if (error) throw new Error(`bounty_claims: ${error.message}`);
  const statuses = (data ?? []).map((row) => row.status as string);
  return statuses.length > 0 && statuses.every((status) => status === 'expired' || status === 'rejected' || status === 'withdrawn');
}

/**
 * What the claimant's wallet must sign to hold a program-held bounty: the
 * program's `accept` (which checks the certification account itself) and the
 * step's memo. Throws `EscrowProgramError` when the account cannot take a claim.
 */
export async function acceptInstructions(db: IteraClient, bounty: BountyRow, wallet: string, proofAsset: string): Promise<Instruction[]> {
  const terms = await escrowTerms(bounty, await loadConfig(db));
  if (!terms) throw new EscrowProgramError('not_configured');
  const state = await readEscrow(terms.programId, bounty.escrow_address);
  if (!state) throw new EscrowProgramError('wrong_escrow_account');
  // An account that names a wallet is reopened inside this accept only when it is a leftover: a claim our tables already
  // let go of (out of time, rejected, given up). A claimant the tables do not know yet is another learner's accept that
  // landed a moment ago and is being recorded: taking the account from them would leave page and chain apart.
  if (state.status === 'claimed' && !(await isLeftoverClaim(db, bounty.id, state.claimant))) throw new EscrowProgramError('not_open');
  const plan = acceptPlan(state, terms, wallet, proofAsset);
  if (plan === 'closed') throw new EscrowProgramError('not_open');
  return [...plan, memoInstruction(transferMemo(bounty.id, 'accept'))];
}

/**
 * What the claimant's wallet must sign to give a program-held bounty up: the
 * program's `unclaim`, signed by the claimant alone. `null` when the account
 * does not name this wallet (nothing to undo on chain).
 */
export async function withdrawInstructions(db: IteraClient, bounty: BountyRow, wallet: string): Promise<Instruction[] | null> {
  const terms = await escrowTerms(bounty, await loadConfig(db));
  if (!terms) return null;
  const state = await readEscrow(terms.programId, bounty.escrow_address);
  if (state?.status !== 'claimed' || state.claimant !== wallet) return null;
  return [unclaimInstruction({ programId: terms.programId, authority: wallet, escrow: bounty.escrow_address }), memoInstruction(transferMemo(bounty.id, 'give-up'))];
}

/** The escrow account of a program-held bounty as the chain has it now. `null` when there is none. */
export async function escrowStateOf(db: IteraClient, bounty: BountyRow): Promise<EscrowState | null> {
  const terms = await escrowTerms(bounty, await loadConfig(db));
  return terms ? readEscrow(terms.programId, bounty.escrow_address) : null;
}

/** Reopens an escrow account that names `wallet`, signed by Itera's attester key. Whether it did. Never throws. */
export async function reopenOnChain(db: IteraClient, bounty: BountyRow, wallet: string): Promise<boolean> {
  try {
    const terms = await escrowTerms(bounty, await loadConfig(db));
    if (!terms) return false;
    const state = await readEscrow(terms.programId, bounty.escrow_address);
    if (state?.status !== 'claimed' || state.claimant !== wallet) return false;
    await sendAsApprover([unclaimInstruction({ programId: terms.programId, authority: terms.attester, escrow: bounty.escrow_address })], transferMemo(bounty.id, 'rejected'));
    return true;
  } catch (error) {
    console.error('bounty escrow not reopened', bounty.id, error instanceof Error ? error.message : error);
    return false;
  }
}

type ClaimStep = 'accepted' | 'withdrawn' | 'expired' | 'rejected';

/** Puts the transaction of a claim's step on its ledger row, with the wallet that signed the program's instruction. */
export async function recordStepSignature(db: IteraClient, step: { bountyId: string; claimId: string; kind: ClaimStep; signature: string; signer: string }): Promise<void> {
  const { error } = await db.from('bounty_events').update({ signature: step.signature, signer: step.signer }).eq('bounty_id', step.bountyId).eq('claim_id', step.claimId).eq('kind', step.kind);
  if (error) console.error('bounty step signature not recorded', step.bountyId, step.kind, step.signature, error.message);
}

/**
 * Reopens the escrow account of a claim our tables just let go of without the
 * learner (out of time, delivery rejected), so the account stops naming them.
 * Signed by Itera's attester key; the transaction lands on the step's ledger
 * row. Never throws: a failure leaves the account behind the page, and the next
 * accept or refund reopens it in its own transaction.
 */
export async function unclaimOnChain(db: IteraClient, bounty: BountyRow, kind: 'expired' | 'rejected', claim: { id: string; wallet: string }): Promise<string | null> {
  try {
    if (bounty.escrow_kind !== 'program') return null;
    const terms = await escrowTerms(bounty, await loadConfig(db));
    if (!terms) return null;
    const state = await readEscrow(terms.programId, bounty.escrow_address);
    if (state?.status !== 'claimed' || state.claimant !== claim.wallet) return null;
    const signature = await sendAsApprover([unclaimInstruction({ programId: terms.programId, authority: terms.attester, escrow: bounty.escrow_address })], transferMemo(bounty.id, kind));
    await recordStepSignature(db, { bountyId: bounty.id, claimId: claim.id, kind, signature, signer: terms.attester });
    return signature;
  } catch (error) {
    console.error('bounty claim not reopened on chain', bounty.id, kind, error instanceof Error ? error.message : error);
    return null;
  }
}

/** Hands a bounty whose learner ran out of time back to the board. Never throws. */
export async function expireStaleClaims(db: IteraClient, bounties: BountyRow[], claims: Map<string, ClaimRow>, now: Date): Promise<boolean> {
  let changed = false;
  for (const bounty of bounties) {
    const claim = bounty.claim_id ? claims.get(bounty.claim_id) : undefined;
    if (bounty.status !== 'claimed' || !claim || Date.parse(claim.deadline_at) > now.getTime()) continue;
    const { data, error } = await db.rpc('bounty_release_claim', { p_bounty: bounty.id, p_reason: 'expired', p_user_id: null });
    if (error) console.error('bounty expire failed', error.message);
    else if (data === 'ok') {
      changed = true;
      await unclaimOnChain(db, bounty, 'expired', claim);
    }
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
  const addresses = [...new Set<string>((data ?? []).map((row: { asset_address: unknown }) => String(row.asset_address)))];
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
  // An account at the address that is not this bounty's holds none of its money: there is nothing of ours to move.
  if (state.id !== terms.bountyId || state.approver !== terms.approver || state.sponsor !== terms.sponsor) {
    if (done !== 'refunded') return 'stuck';
    await mark(db, bounty.id, ['refunding'], 'refunded', { wallet: recipient, lamports: 0n, signature: null });
    return 'settled';
  }
  // A bounty a wallet posted: this server holds no key of it. It can record what the sponsor's wallet already did,
  // and return expired money to that wallet (`walletRefundable`); it can never pay anyone.
  const ours = terms.approver === terms.attester;
  const plan = claim ? releasePlan(state, terms, claim.wallet) : refundPlan(state, terms);
  if (!ours && claim && Array.isArray(plan)) {
    console.error('bounty payout waits for its sponsor wallet', bounty.id);
    return 'stuck';
  }
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

/**
 * Whether this server can finish the refund of a bounty a wallet posted. It holds no key of that escrow, so only:
 * the account is not there (never funded), the sponsor's wallet already refunded it, or the bounty is past its
 * date and the deployed program lets anyone send expired money back to its sponsor (`bounty_escrow_version` 2).
 */
async function walletRefundable(db: IteraClient, bounty: BountyRow): Promise<boolean> {
  const config = await loadConfig(db);
  const terms = await escrowTerms(bounty, config);
  if (!terms) return false;
  const state = await readEscrow(terms.programId, bounty.escrow_address);
  if (!state || state.status === 'refunded') return true;
  return Number(config.bounty_escrow_version) >= 2 && state.status !== 'paid' && state.expiresAt * 1000 <= Date.now();
}

/** Starts the refund of a bounty nobody is working on, and tries to finish it. */
export async function refundBounty(db: IteraClient, bounty: BountyRow, actorWallet: string | null): Promise<TransferOutcome | 'not_refundable'> {
  if (bounty.status !== 'refunding') {
    if (bounty.origin === 'wallet' && !(await walletRefundable(db, bounty))) return 'not_refundable';
    const started = await mark(db, bounty.id, ['awaiting_funding', 'open'], 'refunding', { wallet: actorWallet });
    if (!started) return 'not_refundable';
  }
  return settleTransfer(db, bounty.id);
}

/**
 * Brings our row in line with an escrow that moved without us. The sponsor's
 * own wallet may refund an unclaimed bounty straight on the program: an open
 * bounty the chain shows as refunded is marked refunded. The claimant's own
 * wallet may give a bounty up straight on the program: a held bounty the chain
 * shows as open goes back to the board. Only ever follows the chain.
 */
export async function syncWithEscrow(db: IteraClient, bountyId: string): Promise<void> {
  const bounty = await loadBounty(db, { id: bountyId });
  if (!bounty || bounty.escrow_kind !== 'program' || (bounty.status !== 'open' && bounty.status !== 'claimed')) return;
  const terms = await escrowTerms(bounty, await loadConfig(db));
  if (!terms) return;
  const state = await readEscrow(terms.programId, bounty.escrow_address);
  if (bounty.status === 'open') {
    if (state?.status === 'refunded') await refundBounty(db, bounty, null);
    return;
  }
  const claim = bounty.claim_id ? (await loadClaims(db, [bounty.claim_id])).get(bounty.claim_id) : undefined;
  if (!claim || state?.status !== 'open') return;
  // A node a few slots behind still shows the account open right after an accept landed: a fresh claim is never let go on that word.
  if (Date.now() - Date.parse(claim.accepted_at) < FRESH_CLAIM_MS) return;
  const { data, error } = await db.rpc('bounty_release_claim', { p_bounty: bounty.id, p_reason: 'withdrawn', p_user_id: claim.user_id });
  if (error) throw new Error(`bounty_release_claim: ${error.message}`);
  if (data !== 'ok') return;
  const history = await escrowHistory(bounty.escrow_address).catch(() => [] as SignatureInfo[]);
  // Give-ups signed before 12 Oct 2026 carry the memo `…:withdraw`.
  const signature = findPayment(history, transferMemo(bounty.id, 'give-up')) ?? findPayment(history, `itera-bounty:${bounty.id}:withdraw`);
  if (signature) await recordStepSignature(db, { bountyId: bounty.id, claimId: claim.id, kind: 'withdrawn', signature, signer: claim.wallet });
}

/**
 * Records the payout a sponsor's wallet signed on the program: the account says `paid` to the learner whose
 * delivery waits for review, so the review is written as approved and the bounty closes as paid. The chain
 * moved first; this only makes our tables say so. Returns the bounty's status afterwards.
 */
export async function recordWalletPayout(db: IteraClient, bountyId: string, review?: { reviewer: string; note: string | null }): Promise<BountyStatus | null> {
  const bounty = await loadBounty(db, { id: bountyId });
  if (!bounty) return null;
  if (bounty.origin !== 'wallet' || bounty.escrow_kind !== 'program' || (bounty.status !== 'submitted' && bounty.status !== 'paying')) return bounty.status;
  const terms = await escrowTerms(bounty, await loadConfig(db));
  const claim = bounty.claim_id ? (await loadClaims(db, [bounty.claim_id])).get(bounty.claim_id) : undefined;
  if (!terms || !claim) return bounty.status;
  const state = await readEscrow(terms.programId, bounty.escrow_address);
  if (state?.status !== 'paid' || state.claimant !== claim.wallet) return bounty.status;
  if (bounty.status === 'submitted') {
    const { data, error } = await db.rpc('bounty_review', { p_bounty: bounty.id, p_reviewer: review?.reviewer ?? null, p_approve: true, p_note: review?.note ?? null });
    if (error) throw new Error(`bounty_review: ${error.message}`);
    if (data !== 'ok') return (await loadBounty(db, { id: bountyId }))?.status ?? null;
  }
  await settleTransfer(db, bounty.id);
  return (await loadBounty(db, { id: bountyId }))?.status ?? null;
}

/**
 * Open bounties whose escrow the chain already shows as refunded (see
 * `syncWithEscrow`) leave the board: one read of the accounts, then one row each.
 */
export async function syncOpenEscrows(db: IteraClient): Promise<number> {
  const config = await loadConfig(db);
  if (!config.bounty_escrow_program) return 0;
  const { data, error } = await db.from('bounties').select('id,escrow_address').eq('status', 'open').eq('escrow_kind', 'program').limit(100);
  if (error) throw new Error(`bounties sync: ${error.message}`);
  const open = (data ?? []) as Array<{ id: string; escrow_address: string }>;
  const states = await readEscrows(config.bounty_escrow_program, open.map((row) => row.escrow_address));
  const gone = open.filter((row) => states.get(row.escrow_address)?.status === 'refunded');
  for (const row of gone) await syncWithEscrow(db, row.id).catch((reason) => console.error('bounty not synced with its escrow', row.id, reason));
  const reviewing = await db.from('bounties').select('id,escrow_address').in('status', ['submitted', 'paying']).eq('origin', 'wallet').eq('escrow_kind', 'program').limit(100);
  if (reviewing.error) throw new Error(`bounties sync: ${reviewing.error.message}`);
  const waiting = (reviewing.data ?? []) as Array<{ id: string; escrow_address: string }>;
  const paid = waiting.length === 0 ? new Map() : await readEscrows(config.bounty_escrow_program, waiting.map((row) => row.escrow_address));
  for (const row of waiting) {
    if (paid.get(row.escrow_address)?.status !== 'paid') continue;
    await recordWalletPayout(db, row.id).catch((reason) => console.error('bounty payout not recorded', row.id, reason));
  }
  return gone.length;
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
    return due.length + (await syncOpenEscrows(db));
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
