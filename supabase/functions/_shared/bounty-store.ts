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
import type { IteraClient } from './db.ts';
import { findPayment, type SignatureInfo } from './gift.ts';
import { BASE_FEE_LAMPORTS } from './purchase-verify.ts';
import { rpc } from './rpc.ts';
import { TransferBroadcastError, signatureFate } from './treasury.ts';

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
  const { data, error } = await (tenantIds ? query.in('tenant_id', tenantIds) : query.eq('is_test', false));
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

/**
 * Opens a bounty whose escrow account holds the reward and the fee. The balance
 * is the chain's: whoever paid, and through whichever client, the bounty opens
 * when the money is there. Returns the bounty as it stands afterwards.
 */
export async function refreshFunding(db: IteraClient, bounty: BountyRow, known?: { wallet: string; signature: string }): Promise<BountyRow> {
  if (bounty.status !== 'awaiting_funding') return bounty;
  const balance = await escrowBalance(bounty.escrow_address);
  if (balance < fundingTarget(bounty.reward_lamports)) return bounty;
  let signature = known?.signature ?? null;
  if (!signature) {
    const history = await escrowHistory(bounty.escrow_address).catch(() => [] as SignatureInfo[]);
    signature = history.filter((entry) => entry.err === null).at(-1)?.signature ?? null;
  }
  await mark(db, bounty.id, ['awaiting_funding'], 'open', { wallet: known?.wallet ?? null, lamports: balance, signature });
  return (await loadBounty(db, { id: bounty.id })) ?? bounty;
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
  const addresses = [...new Set((data ?? []).map((row) => row.asset_address as string))];
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

/**
 * Finishes the transfer a bounty is waiting on: the payout of a `paying` one
 * (to the wallet of its approved claim) or the refund of a `refunding` one (to
 * the sponsor's refund address). Safe to call any number of times, from any
 * number of requests: one request at a time holds the lease, a signature that
 * may still land is never sent again, and the transfer empties the escrow
 * account, so the chain itself refuses a second one.
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
  if (paying) {
    const claim = bounty.claim_id ? (await loadClaims(db, [bounty.claim_id])).get(bounty.claim_id) : undefined;
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

  // The lease: only the request that still sees the row as it read it may send.
  let lease = db
    .from('bounties')
    .update({ transfer_sent_at: new Date().toISOString(), transfer_signature: null, transfer_lamports: null })
    .eq('id', bounty.id)
    .eq('status', bounty.status);
  lease = bounty.transfer_signature ? lease.eq('transfer_signature', bounty.transfer_signature) : lease.is('transfer_signature', null);
  lease = bounty.transfer_sent_at ? lease.eq('transfer_sent_at', bounty.transfer_sent_at) : lease.is('transfer_sent_at', null);
  const leased = await lease.select('id');
  if (leased.error) throw new Error(`bounty lease: ${leased.error.message}`);
  if ((leased.data ?? []).length === 0) return 'pending';

  const balance = await escrowBalance(bounty.escrow_address);
  const lamports = drainLamports(balance);
  if (lamports === null) {
    // Nothing left to send. Either an earlier transfer of ours emptied the account, or it never held anything.
    const earlier = findPayment(await escrowHistory(bounty.escrow_address), memo);
    if (earlier) {
      await mark(db, bounty.id, [bounty.status], done, { wallet: recipient, lamports: BigInt(bounty.funded_lamports ?? bounty.reward_lamports) - BASE_FEE_LAMPORTS, signature: earlier });
      return 'settled';
    }
    if (!paying) {
      await mark(db, bounty.id, ['refunding'], 'refunded', { wallet: recipient, lamports: 0n, signature: null });
      return 'settled';
    }
    console.error('bounty payout stuck: empty escrow with no payout on chain', bounty.id);
    return 'stuck';
  }

  try {
    const signature = await sendFromEscrow({
      bountyId: bounty.id,
      expectedAddress: bounty.escrow_address,
      recipient,
      lamports,
      memo,
      onBroadcast: async (sent) => {
        const { error } = await db.from('bounties').update({ transfer_signature: sent, transfer_lamports: Number(lamports) }).eq('id', bounty.id).eq('status', bounty.status);
        if (error) console.error('bounty transfer signature not recorded', bounty.id, sent, error.message);
      },
    });
    await mark(db, bounty.id, [bounty.status], done, { wallet: recipient, lamports, signature });
    return 'settled';
  } catch (error) {
    if (!(error instanceof TransferBroadcastError)) {
      // Nothing was sent: give the lease back so the next request can try at once.
      await db.from('bounties').update({ transfer_sent_at: null }).eq('id', bounty.id).eq('status', bounty.status).is('transfer_signature', null);
      throw error;
    }
    console.error('bounty transfer not confirmed', bounty.id, error.signature, error.message);
    return 'pending';
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
