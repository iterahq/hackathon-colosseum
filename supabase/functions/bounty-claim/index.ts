import { CLAIM_COLUMNS, eligibilityOf, loadBounty, loadClaims, openClaimOf } from '../_shared/bounty-store.ts';
import { parseSubmission, publicStatus, type BountyRow, type ClaimRow } from '../_shared/bounty.ts';
import { callerFailureStatus, resolveCaller, type Caller } from '../_shared/caller.ts';
import { loadConfig, serviceClient, type IteraClient } from '../_shared/db.ts';
import { corsHeaders, isUuid, json, readJsonObject } from '../_shared/http.ts';
import { RpcError } from '../_shared/rpc.ts';

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

async function accept(db: IteraClient, caller: Caller, bounty: BountyRow, cors: Cors): Promise<Response> {
  if (publicStatus(bounty, new Date()) !== 'open') return json({ error: 'not_open' }, 409, cors);
  // The gate: the certification is read from chain now, whatever our tables say about this learner.
  const eligibility = await eligibilityOf(db, caller.wallet, bounty, await loadConfig(db));
  if (!eligibility.eligible || !eligibility.proof || !caller.wallet) {
    return json({ error: 'not_eligible', reason: eligibility.reason, proof: eligibility.proof }, 403, cors);
  }
  const { data, error } = await db.rpc('bounty_accept', {
    p_bounty: bounty.id,
    p_user_id: caller.iteraUserId,
    p_wallet: caller.wallet,
    p_proof_asset: eligibility.proof.asset,
    p_proof: { days_done: eligibility.proof.days_done, requirement: bounty.requirement, read_at: new Date().toISOString(), source: 'chain' },
  });
  if (error) throw new Error(`bounty_accept: ${error.message}`);
  const result = (Array.isArray(data) ? data[0] : data) as { status: string } | null;
  if (result?.status !== 'ok') return json({ error: result?.status ?? 'not_open' }, 409, cors);
  return json({ accepted: true, proof: eligibility.proof }, 200, cors);
}

async function submit(db: IteraClient, caller: Caller, bounty: BountyRow, body: Record<string, unknown>, cors: Cors): Promise<Response> {
  const submission = parseSubmission(body);
  if (!submission) return json({ error: 'invalid_submission' }, 400, cors);
  const { data, error } = await db.rpc('bounty_submit', { p_bounty: bounty.id, p_user_id: caller.iteraUserId, p_url: submission.url, p_note: submission.note });
  if (error) throw new Error(`bounty_submit: ${error.message}`);
  if (data !== 'ok') return json({ error: 'not_active' }, 409, cors);
  return json({ submitted: true }, 200, cors);
}

async function withdraw(db: IteraClient, caller: Caller, bounty: BountyRow, cors: Cors): Promise<Response> {
  const { data, error } = await db.rpc('bounty_release_claim', { p_bounty: bounty.id, p_reason: 'withdrawn', p_user_id: caller.iteraUserId });
  if (error) throw new Error(`bounty_release_claim: ${error.message}`);
  if (data !== 'ok') return json({ error: 'not_active' }, 409, cors);
  return json({ withdrawn: true }, 200, cors);
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
  try {
    const db = serviceClient();
    const caller = await resolveCaller(db, request);
    if (typeof caller === 'string') return json({ error: caller }, callerFailureStatus(caller), cors);
    const body = await readJsonObject(request, 4096);
    const bountyId = body?.bounty;
    if (!body || typeof bountyId !== 'string' || !isUuid(bountyId)) return json({ error: 'invalid_body' }, 400, cors);
    const bounty = await loadBounty(db, { id: bountyId });
    if (!bounty) return json({ error: 'bounty_not_found' }, 404, cors);

    if (body.action === 'status') return await status(db, caller, bounty, cors);
    if (body.action === 'accept') return await accept(db, caller, bounty, cors);
    if (body.action === 'submit') return await submit(db, caller, bounty, body, cors);
    if (body.action === 'withdraw') return await withdraw(db, caller, bounty, cors);
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
