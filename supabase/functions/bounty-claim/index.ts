import { EscrowProgramError, refusal } from '../_shared/bounty-chain.ts';
import {
  CLAIM_COLUMNS,
  acceptInstructions,
  eligibilityOf,
  escrowStateOf,
  loadBounty,
  loadClaims,
  openClaimOf,
  recordStepSignature,
  reopenOnChain,
  syncWithEscrow,
  withdrawInstructions,
} from '../_shared/bounty-store.ts';
import { parseSubmission, publicStatus, type BountyRow, type ClaimRow } from '../_shared/bounty.ts';
import { CosignError, isExpiredBlockhash, offerCosigned, parseSignedByWallet, sendCosigned, type SignedByWallet } from '../_shared/cosign.ts';
import { takeRate, tooMany, type RateLimit } from '../_shared/ratelimit.ts';
import type { Instruction } from '../_shared/solana-message.ts';
import { TransferBroadcastError } from '../_shared/treasury.ts';
import { callerFailureStatus, resolveCaller, type Caller } from '../_shared/caller.ts';
import { explorerUrl } from '../_shared/credential.ts';
import { loadConfig, serviceClient, type IteraClient } from '../_shared/db.ts';
import { corsHeaders, isUuid, json, readJsonObject } from '../_shared/http.ts';
import { RpcError, RpcNodeError } from '../_shared/rpc.ts';

type Cors = Record<string, string>;

function ownClaim(claim: ClaimRow | null | undefined, caller: Caller) {
  if (!claim || claim.user_id !== caller.iteraUserId) return null;
  return {
    bounty_id: claim.bounty_id,
    status: claim.status,
    accepted_at: claim.accepted_at,
    deadline_at: claim.deadline_at,
    submission_url: claim.submission_url,
    submission_note: claim.submission_note,
    submitted_at: claim.submitted_at,
    review_note: claim.review_note,
  };
}

/** Where the signed-in learner stands on one bounty: eligible or not (from chain), and their own claim. */
async function status(db: IteraClient, caller: Caller, bounty: BountyRow, cors: Cors): Promise<Response> {
  const [eligibility, current, open, last] = await Promise.all([
    eligibilityOf(db, caller.wallet, bounty, await loadConfig(db)),
    bounty.claim_id ? loadClaims(db, [bounty.claim_id]).then((claims) => claims.get(bounty.claim_id as string)) : undefined,
    openClaimOf(db, caller.iteraUserId),
    db
      .from('bounty_claims')
      .select(CLAIM_COLUMNS)
      .eq('bounty_id', bounty.id)
      .eq('user_id', caller.iteraUserId)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (last.error) throw new Error(`bounty_claims: ${last.error.message}`);
  return json(
    {
      wallet: caller.wallet,
      eligible: eligibility.eligible,
      reason: eligibility.reason,
      proof: eligibility.proof,
      claim: ownClaim(current, caller) ?? ownClaim(last.data as unknown as ClaimRow | null, caller),
      busy_elsewhere: open !== null && open.bounty_id !== bounty.id,
    },
    200,
    cors,
  );
}

const SIGN_RATE: RateLimit = { limit: 40, windowMs: 10 * 60_000 };

/** What a failed co-signed send means to the caller. `null`: not ours to explain, rethrow. */
async function sendFailure(db: IteraClient, bounty: BountyRow, error: unknown, cors: Cors): Promise<Response | null> {
  if (error instanceof CosignError) return json({ error: error.code }, error.code === 'expired' ? 409 : 400, cors);
  if (error instanceof RpcNodeError && isExpiredBlockhash(error.nodeMessage)) return json({ error: 'expired' }, 409, cors);
  const refused = refusal(error);
  if (!refused) return null;
  // Someone else's transaction landed first, or the escrow moved on chain without us (a sponsor refunding from their own wallet): the board follows.
  if (refused.code === 'not_open' || refused.code === 'not_claimed') {
    await syncWithEscrow(db, bounty.id).catch((reason) => console.error('bounty not synced with its escrow', bounty.id, reason));
    return json({ error: refused.code === 'not_open' ? 'not_open' : 'not_active', reason: 'refused_by_program' }, 409, cors);
  }
  return json({ error: 'refused_by_program', reason: refused.code }, 403, cors);
}

/**
 * Accepting is the learner's own transaction: `prepare` answers the escrow
 * program's `accept` for their wallet to sign (the treasury pays the fee, the
 * wallet needs no SOL); `submit` takes the signed message back, checks it is
 * the one offered, adds the fee payer's signature and sends it. The program
 * records nobody who did not sign.
 */
async function accept(db: IteraClient, caller: Caller, bounty: BountyRow, signed: SignedByWallet | null, cors: Cors): Promise<Response> {
  if (publicStatus(bounty, new Date()) !== 'open') return json({ error: 'not_open' }, 409, cors);
  // The gate: the certification is read from chain now, whatever our tables say about this learner.
  const eligibility = await eligibilityOf(db, caller.wallet, bounty, await loadConfig(db));
  if (!eligibility.eligible || !eligibility.proof || !caller.wallet) {
    return json({ error: 'not_eligible', reason: eligibility.reason, proof: eligibility.proof }, 403, cors);
  }
  if (bounty.sponsor_wallet && bounty.sponsor_wallet === caller.wallet) return json({ error: 'own_bounty' }, 403, cors);
  if (await openClaimOf(db, caller.iteraUserId)) return json({ error: 'already_claiming' }, 409, cors);
  const wallet = caller.wallet;
  const proof = eligibility.proof;
  const record = async () => {
    const { data, error } = await db.rpc('bounty_accept', {
      p_bounty: bounty.id,
      p_user_id: caller.iteraUserId,
      p_wallet: wallet,
      p_proof_asset: proof.asset,
      p_proof: { days_done: proof.days_done, requirement: bounty.requirement, read_at: new Date().toISOString(), source: 'chain' },
    });
    if (error) throw new Error(`bounty_accept: ${error.message}`);
    return (Array.isArray(data) ? data[0] : data) as { status: string; claim_id: string | null } | null;
  };

  if (bounty.escrow_kind !== 'program') {
    if (!signed) return json({ sign: null, proof }, 200, cors);
    const result = await record();
    return result?.status === 'ok' ? json({ accepted: true, proof, chain: null }, 200, cors) : json({ error: result?.status ?? 'not_open' }, 409, cors);
  }

  let instructions: Instruction[];
  try {
    instructions = await acceptInstructions(db, bounty, wallet, proof.asset);
  } catch (error) {
    if (!(error instanceof EscrowProgramError)) throw error;
    if (error.code !== 'not_open') return json({ error: 'refused_by_program', reason: error.code }, 403, cors);
    await syncWithEscrow(db, bounty.id).catch((reason) => console.error('bounty not synced with its escrow', bounty.id, reason));
    return json({ error: 'not_open', reason: 'refused_by_program' }, 409, cors);
  }
  if (!signed) return json({ sign: await offerCosigned(wallet, instructions), proof }, 200, cors);

  // The chain picks the winner: the program records the first accept that lands and refuses the rest.
  let signature: string;
  try {
    signature = await sendCosigned(signed, wallet, instructions);
  } catch (error) {
    if (error instanceof TransferBroadcastError) {
      // Handed to the node and not seen confirmed: the account says whether it landed, or whether another wallet's did first.
      const after = await escrowStateOf(db, bounty);
      if (after?.status !== 'claimed') return json({ error: 'upstream_unavailable' }, 502, cors);
      if (after.claimant !== wallet) return json({ error: 'not_open', reason: 'refused_by_program' }, 409, cors);
      signature = error.signature;
    } else {
      const failure = await sendFailure(db, bounty, error, cors);
      if (failure) return failure;
      throw error;
    }
  }
  // The account now names this wallet. If our tables cannot follow, it is reopened: the page and the chain never part ways.
  const result = await record().catch(async (error) => {
    await reopenOnChain(db, bounty, wallet);
    throw error;
  });
  if (result?.status !== 'ok' || !result.claim_id) {
    // Our tables refused what the chain took (this learner took another bounty meanwhile): the account is reopened.
    const reopened = await reopenOnChain(db, bounty, wallet);
    console.error('bounty accept landed on chain and was refused by the tables', bounty.id, result?.status, reopened);
    return json({ error: result?.status ?? 'not_open' }, 409, cors);
  }
  await recordStepSignature(db, { bountyId: bounty.id, claimId: result.claim_id, kind: 'accepted', signature, signer: wallet });
  return json({ accepted: true, proof, chain: { status: 'recorded', signature, signed_by: wallet, explorer_url: explorerUrl('tx', signature) } }, 200, cors);
}

async function submit(db: IteraClient, caller: Caller, bounty: BountyRow, body: Record<string, unknown>, cors: Cors): Promise<Response> {
  const submission = parseSubmission(body);
  if (!submission) return json({ error: 'invalid_submission' }, 400, cors);
  const { data, error } = await db.rpc('bounty_submit', { p_bounty: bounty.id, p_user_id: caller.iteraUserId, p_url: submission.url, p_note: submission.note });
  if (error) throw new Error(`bounty_submit: ${error.message}`);
  if (data !== 'ok') return json({ error: 'not_active' }, 409, cors);
  return json({ submitted: true }, 200, cors);
}

/**
 * Giving up is the learner's own transaction too: the program's `unclaim`
 * signed by the wallet that holds the bounty. After it the escrow account no
 * longer names them, and only then do our tables let the claim go.
 */
async function withdraw(db: IteraClient, caller: Caller, bounty: BountyRow, signed: SignedByWallet | null, submitting: boolean, cors: Cors): Promise<Response> {
  const claim = bounty.status === 'claimed' && bounty.claim_id ? (await loadClaims(db, [bounty.claim_id])).get(bounty.claim_id) : undefined;
  if (!claim || claim.status !== 'active' || claim.user_id !== caller.iteraUserId) return json({ error: 'not_active' }, 409, cors);
  const instructions = bounty.escrow_kind === 'program' ? await withdrawInstructions(db, bounty, claim.wallet) : null;
  if (!submitting) return json({ sign: instructions ? await offerCosigned(claim.wallet, instructions) : null }, 200, cors);

  let signature: string | null = null;
  if (instructions) {
    if (!signed) return json({ error: 'signature_required' }, 400, cors);
    try {
      signature = await sendCosigned(signed, claim.wallet, instructions);
    } catch (error) {
      if (error instanceof TransferBroadcastError) {
        const after = await escrowStateOf(db, bounty);
        if (after?.status === 'claimed' && after.claimant === claim.wallet) return json({ error: 'upstream_unavailable' }, 502, cors);
        signature = error.signature;
      } else {
        const failure = await sendFailure(db, bounty, error, cors);
        if (failure) return failure;
        throw error;
      }
    }
  }
  const { data, error } = await db.rpc('bounty_release_claim', { p_bounty: bounty.id, p_reason: 'withdrawn', p_user_id: caller.iteraUserId });
  if (error) throw new Error(`bounty_release_claim: ${error.message}`);
  if (data !== 'ok') return json({ error: 'not_active' }, 409, cors);
  if (signature) await recordStepSignature(db, { bountyId: bounty.id, claimId: claim.id, kind: 'withdrawn', signature, signer: claim.wallet });
  return json({ withdrawn: true, chain: signature ? { status: 'recorded', signature, signed_by: claim.wallet, explorer_url: explorerUrl('tx', signature) } : null }, 200, cors);
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
  try {
    const db = serviceClient();
    const caller = await resolveCaller(db, request);
    if (typeof caller === 'string') return json({ error: caller }, callerFailureStatus(caller), cors);
    const body = await readJsonObject(request, 8192);
    const bountyId = body?.bounty;
    if (!body || typeof bountyId !== 'string' || !isUuid(bountyId)) return json({ error: 'invalid_body' }, 400, cors);
    const bounty = await loadBounty(db, { id: bountyId });
    if (!bounty) return json({ error: 'bounty_not_found' }, 404, cors);

    if (body.action === 'status') return await status(db, caller, bounty, cors);
    if (body.action === 'submit') return await submit(db, caller, bounty, body, cors);
    // A page loaded before accepting became the learner's own transaction.
    if (body.action === 'accept' || body.action === 'withdraw') return json({ error: 'client_outdated' }, 409, cors);
    const step = /^(accept|withdraw)_(prepare|submit)$/.exec(typeof body.action === 'string' ? body.action : '');
    if (step) {
      const verdict = await takeRate(db, 'bounty-claim-sign', caller.iteraUserId, SIGN_RATE);
      if (!verdict.allowed) return tooMany(verdict, cors);
      const submitting = step[2] === 'submit';
      const signed = submitting ? parseSignedByWallet(body) : null;
      if (submitting && !signed && (body.message !== undefined || body.signature !== undefined)) return json({ error: 'invalid_transaction' }, 400, cors);
      if (step[1] === 'withdraw') return await withdraw(db, caller, bounty, signed, submitting, cors);
      if (submitting && !signed && bounty.escrow_kind === 'program') return json({ error: 'signature_required' }, 400, cors);
      return await accept(db, caller, bounty, submitting ? (signed ?? { message: new Uint8Array(), signature: new Uint8Array() }) : null, cors);
    }
    return json({ error: 'invalid_action' }, 400, cors);
  } catch (error) {
    if (error instanceof RpcError) {
      console.error('bounty-claim rpc failed', error.message);
      return json({ error: 'upstream_unavailable' }, 502, cors);
    }
    console.error('bounty-claim failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
