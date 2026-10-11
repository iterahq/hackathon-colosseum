import { escrowAddress, escrowBalance } from '../_shared/bounty-escrow.ts';
import {
  expireStaleClaims,
  listBounties,
  loadBounty,
  loadClaims,
  refreshFunding,
  refundBounty,
  settleTransfer,
} from '../_shared/bounty-store.ts';
import { bountyView, fundingTarget, parseNewBounty, trailAttribute, transferMemo, type BountyRow, type ClaimRow, type Requirement } from '../_shared/bounty.ts';
import { callerFailureStatus, resolveCaller, type Caller } from '../_shared/caller.ts';
import { pickText } from '../_shared/credential.ts';
import { loadConfig, serviceClient, type IteraClient } from '../_shared/db.ts';
import { corsHeaders, functionsBase, isUuid, json, readJsonObject } from '../_shared/http.ts';
import { RpcError } from '../_shared/rpc.ts';
import { loadMemberships } from '../_shared/staff-store.ts';
import { staffTenantIds } from '../_shared/staff.ts';
import { TransferBroadcastError, TreasuryNotConfiguredError, sendFromTreasury, treasuryAddress } from '../_shared/treasury.ts';

type Cors = Record<string, string>;
const PROGRAM_SLUG = 'itera-v2';

interface Sponsor {
  caller: Caller;
  tenantIds: string[];
  /** May fund from the Itera treasury. */
  treasuryTenant: string | null;
}

interface Trail {
  unit_id: string;
  title: Record<string, string>;
  total_days: number;
}

async function loadTrails(db: IteraClient): Promise<Trail[]> {
  const { data, error } = await db.from('units').select('id,title_i18n,ordinal,programs!inner(slug),lessons(count)').eq('programs.slug', PROGRAM_SLUG).order('ordinal');
  if (error) throw new Error(`units: ${error.message}`);
  return ((data ?? []) as unknown as Array<{ id: string; title_i18n: Record<string, string>; lessons: Array<{ count: number }> }>).map((unit) => ({
    unit_id: unit.id,
    title: unit.title_i18n,
    total_days: unit.lessons[0]?.count ?? 0,
  }));
}

/** A bounty as its sponsor sees it: the public view plus the delivery under review. */
function sponsorView(bounty: BountyRow, claim: ClaimRow | null, now: Date, treasuryTenant: string | null, treasury: string | null) {
  return {
    ...bountyView({ bounty, claim, lang: 'en', now, functionsBase: functionsBase() }),
    title_i18n: bounty.title_i18n,
    treasury_fundable: bounty.tenant_id === treasuryTenant && bounty.refund_address === treasury,
    review: claim
      ? { status: claim.status, wallet: claim.wallet, submission_url: claim.submission_url, submission_note: claim.submission_note, submitted_at: claim.submitted_at, proof: claim.proof }
      : null,
  };
}

async function list(db: IteraClient, sponsor: Sponsor, cors: Cors): Promise<Response> {
  const now = new Date();
  let bounties = await listBounties(db, sponsor.tenantIds);
  let claims = await loadClaims(db, bounties.flatMap((bounty) => (bounty.claim_id ? [bounty.claim_id] : [])));
  if (await expireStaleClaims(db, bounties, claims, now)) {
    bounties = await listBounties(db, sponsor.tenantIds);
    claims = await loadClaims(db, bounties.flatMap((bounty) => (bounty.claim_id ? [bounty.claim_id] : [])));
  }
  const treasury = sponsor.treasuryTenant ? await treasuryAddress() : null;
  return json(
    {
      tenant_ids: sponsor.tenantIds,
      treasury_tenant: sponsor.treasuryTenant,
      trails: await loadTrails(db),
      bounties: bounties.map((bounty) => sponsorView(bounty, bounty.claim_id ? (claims.get(bounty.claim_id) ?? null) : null, now, sponsor.treasuryTenant, treasury)),
    },
    200,
    cors,
  );
}

async function create(db: IteraClient, sponsor: Sponsor, body: Record<string, unknown>, cors: Cors): Promise<Response> {
  const parsed = parseNewBounty(body, new Date());
  if (!parsed.ok) return json({ error: parsed.error }, 400, cors);
  const input = parsed.value;
  const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id : sponsor.tenantIds[0];
  if (!sponsor.tenantIds.includes(tenantId)) return json({ error: 'forbidden' }, 403, cors);
  const trail = (await loadTrails(db)).find((entry) => entry.unit_id === input.unit_id);
  if (!trail || input.min_days > trail.total_days) return json({ error: 'invalid_requirement' }, 400, cors);
  // Without an address of their own, a refund returns to the treasury, and only the treasury's sponsor may say so.
  const refundAddress = input.refund_address ?? (tenantId === sponsor.treasuryTenant ? await treasuryAddress() : null);
  if (!refundAddress) return json({ error: 'invalid_refund_address' }, 400, cors);

  const id = crypto.randomUUID();
  const requirement: Requirement = {
    program: PROGRAM_SLUG,
    unit_id: trail.unit_id,
    trail: trailAttribute(pickText(trail.title, 'en')),
    trail_title: trail.title,
    min_days: input.min_days,
    total_days: trail.total_days,
  };
  const { error } = await db.from('bounties').insert({
    id,
    slug: input.slug,
    tenant_id: tenantId,
    created_by: sponsor.caller.iteraUserId,
    sponsor_name: input.sponsor_name,
    title_i18n: input.title_i18n,
    summary_i18n: input.summary_i18n,
    brief_i18n: input.brief_i18n,
    deliverable_i18n: input.deliverable_i18n,
    requirement,
    reward_lamports: input.reward_lamports,
    escrow_address: await escrowAddress(id),
    refund_address: refundAddress,
    claim_hours: input.claim_hours,
    expires_at: input.expires_at,
  });
  if (error) return error.code === '23505' ? json({ error: 'slug_taken' }, 409, cors) : Promise.reject(new Error(`bounties insert: ${error.message}`));
  const { error: eventError } = await db.from('bounty_events').insert({ bounty_id: id, kind: 'created', wallet: sponsor.caller.wallet });
  if (eventError) console.error('bounty created event not written', id, eventError.message);
  return json({ created: true, id, slug: input.slug }, 200, cors);
}

/** DevFellowship's own bounties: the treasury sends what the escrow account still lacks. */
async function fund(db: IteraClient, sponsor: Sponsor, bounty: BountyRow, cors: Cors): Promise<Response> {
  if (bounty.tenant_id !== sponsor.treasuryTenant) return json({ error: 'treasury_not_allowed' }, 403, cors);
  // Treasury money only enters an escrow whose refund returns to the treasury: otherwise fund + refund would move it to any address.
  if (bounty.refund_address !== (await treasuryAddress())) return json({ error: 'treasury_not_allowed' }, 403, cors);
  if (bounty.status !== 'awaiting_funding' || Date.parse(bounty.expires_at) <= Date.now()) return json({ error: 'not_fundable' }, 409, cors);
  const missing = fundingTarget(bounty.reward_lamports) - (await escrowBalance(bounty.escrow_address));
  if (missing <= 0n) return json({ funded: true, status: (await refreshFunding(db, bounty)).status }, 200, cors);
  try {
    const signature = await sendFromTreasury({ recipient: bounty.escrow_address, lamports: missing, memo: transferMemo(bounty.id, 'fund') });
    const after = await refreshFunding(db, bounty, { wallet: await treasuryAddress(), signature });
    return json({ funded: after.status === 'open', status: after.status, signature }, 200, cors);
  } catch (error) {
    if (error instanceof TransferBroadcastError) return json({ funded: false, status: 'awaiting_funding', signature: error.signature, pending: true }, 202, cors);
    throw error;
  }
}

async function review(db: IteraClient, sponsor: Sponsor, bounty: BountyRow, approve: boolean, body: Record<string, unknown>, cors: Cors): Promise<Response> {
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 1000) : null;
  if (bounty.status === 'submitted') {
    const claim = bounty.claim_id ? (await loadClaims(db, [bounty.claim_id])).get(bounty.claim_id) : undefined;
    // Nobody approves their own delivery.
    if (claim?.user_id === sponsor.caller.iteraUserId) return json({ error: 'self_review' }, 403, cors);
    const { data, error } = await db.rpc('bounty_review', { p_bounty: bounty.id, p_reviewer: sponsor.caller.iteraUserId, p_approve: approve, p_note: note });
    if (error) throw new Error(`bounty_review: ${error.message}`);
    if (data !== 'ok') {
      // Another approval of the same delivery got there first: this one only helps the payout through.
      const moved = await loadBounty(db, { id: bounty.id });
      if (!approve || (moved?.status !== 'paying' && moved?.status !== 'paid')) return json({ error: 'not_submitted' }, 409, cors);
    } else if (!approve) {
      return json({ rejected: true, status: 'open' }, 200, cors);
    }
  } else if (!approve || (bounty.status !== 'paying' && bounty.status !== 'paid')) {
    return json({ error: 'not_submitted' }, 409, cors);
  }
  const outcome = await settleTransfer(db, bounty.id);
  const after = await loadBounty(db, { id: bounty.id });
  return json({ approved: true, outcome, status: after?.status, payout_signature: after?.payout_signature ?? after?.transfer_signature ?? null }, outcome === 'settled' ? 200 : 202, cors);
}

async function refund(db: IteraClient, sponsor: Sponsor, bounty: BountyRow, cors: Cors): Promise<Response> {
  const outcome = await refundBounty(db, bounty, sponsor.caller.wallet);
  if (outcome === 'not_refundable') return json({ error: 'not_refundable' }, 409, cors);
  const after = await loadBounty(db, { id: bounty.id });
  return json({ outcome, status: after?.status, refund_signature: after?.refund_signature ?? after?.transfer_signature ?? null }, outcome === 'settled' ? 200 : 202, cors);
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
  try {
    const db = serviceClient();
    const caller = await resolveCaller(db, request);
    if (typeof caller === 'string') return json({ error: caller }, callerFailureStatus(caller), cors);
    const tenantIds = staffTenantIds(await loadMemberships(db, caller.iteraUserId));
    if (tenantIds.length === 0) return json({ error: 'forbidden' }, 403, cors);
    const config = await loadConfig(db);
    const sponsor: Sponsor = { caller, tenantIds, treasuryTenant: tenantIds.includes(config.bounty_treasury_tenant) ? config.bounty_treasury_tenant : null };

    const body = await readJsonObject(request, 16_384);
    if (!body) return json({ error: 'invalid_body' }, 400, cors);
    if (body.action === 'list') return await list(db, sponsor, cors);
    if (body.action === 'create') return await create(db, sponsor, body, cors);

    const bountyId = body.bounty;
    if (typeof bountyId !== 'string' || !isUuid(bountyId)) return json({ error: 'invalid_body' }, 400, cors);
    const bounty = await loadBounty(db, { id: bountyId });
    // A bounty of a tenant the caller does not teach in is not theirs to know about.
    if (!bounty || !tenantIds.includes(bounty.tenant_id)) return json({ error: 'bounty_not_found' }, 404, cors);

    if (body.action === 'fund') return await fund(db, sponsor, bounty, cors);
    if (body.action === 'refresh') return json({ status: (await refreshFunding(db, bounty)).status }, 200, cors);
    if (body.action === 'approve') return await review(db, sponsor, bounty, true, body, cors);
    if (body.action === 'reject') return await review(db, sponsor, bounty, false, body, cors);
    if (body.action === 'refund') return await refund(db, sponsor, bounty, cors);
    return json({ error: 'invalid_action' }, 400, cors);
  } catch (error) {
    if (error instanceof RpcError) {
      console.error('bounty-sponsor rpc failed', error.message);
      return json({ error: 'upstream_unavailable' }, 502, cors);
    }
    if (error instanceof TreasuryNotConfiguredError) {
      console.error('bounty-sponsor treasury not configured', error.message);
      return json({ error: 'treasury_unavailable' }, 503, cors);
    }
    console.error('bounty-sponsor failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
