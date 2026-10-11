import { escrowRentLamports, escrowRentLastRead, createFor, readEscrow, refundPlan } from '../_shared/bounty-chain.ts';
import { escrowPda, releaseInstruction } from '../_shared/bounty-program.ts';
import {
  BOUNTY_COLUMNS,
  PROGRAM_SLUG,
  escrowTerms,
  expireStaleClaims,
  loadBounty,
  loadClaims,
  loadTrails,
  recordWalletPayout,
  refreshFunding,
  syncWithEscrow,
  unclaimOnChain,
  gateOf,
  gatedEscrows,
} from '../_shared/bounty-store.ts';
import {
  MAX_REWARD_LAMPORTS,
  WALLET_LIVE_BOUNTIES,
  WALLET_MAX_CLAIM_HOURS,
  WALLET_MAX_EXPIRY_DAYS,
  WALLET_MIN_REWARD_LAMPORTS,
  WALLET_POSTS_PER_DAY,
  bountyView,
  parseWalletBounty,
  publicStatus,
  slugify,
  trailAttribute,
  transferMemo,
  type BountyRow,
  type ClaimRow,
  type Requirement,
} from '../_shared/bounty.ts';
import { draftVerdict } from '../_shared/bounty-draft.ts';
import { callerFailureStatus, resolveCaller, type Caller } from '../_shared/caller.ts';
import { pickText } from '../_shared/credential.ts';
import { loadConfig, serviceClient, type IteraClient } from '../_shared/db.ts';
import { verifyEd25519 } from '../_shared/ed25519.ts';
import { corsHeaders, functionsBase, isUuid, json, readJsonObject } from '../_shared/http.ts';
import { BASE_FEE_LAMPORTS, fundsCheck } from '../_shared/purchase-verify.ts';
import { callerAddress, takeRate, tooMany, type RateLimit } from '../_shared/ratelimit.ts';
import { RpcError, RpcNodeError, balanceOf, latestBlockhash, rpc, withinMs } from '../_shared/rpc.ts';
import { decodeSignedTransaction, transactionSignature } from '../_shared/signed-tx.ts';
import { compileMessage, memoInstruction, type Instruction } from '../_shared/solana-message.ts';
import { base58Decode, base58Encode, base64Encode, serializeTransaction } from '../_shared/solana-tx.ts';

type Cors = Record<string, string>;
const FUNCTION = 'bounty-post';
const READ_RATE: RateLimit = { limit: 60, windowMs: 60_000 };
const WRITE_RATE: RateLimit = { limit: 20, windowMs: 60_000 };
const DAY_MS = 24 * 60 * 60 * 1000;
const CONFIRM_WAIT_MS = 8_000;
const CONFIRM_POLL_MS = 1_000;
const LIVE = ['awaiting_funding', 'open', 'claimed', 'submitted', 'paying'];

function limits(rent: bigint | null) {
  return {
    min_reward_lamports: Number(WALLET_MIN_REWARD_LAMPORTS),
    max_reward_lamports: Number(MAX_REWARD_LAMPORTS),
    escrow_rent_lamports: rent === null ? null : Number(rent),
    fee_lamports: Number(BASE_FEE_LAMPORTS),
    posts_per_day: WALLET_POSTS_PER_DAY,
    live_bounties: WALLET_LIVE_BOUNTIES,
    max_expiry_days: WALLET_MAX_EXPIRY_DAYS,
    max_claim_hours: WALLET_MAX_CLAIM_HOURS,
  };
}

/** How long the form's read waits for the Solana node before it answers with what it has. */
const FORM_RPC_BUDGET_MS = 1_500;

/** What anyone may read before signing in: the trails a bounty can ask for and the limits of the form. */
async function options(db: IteraClient, cors: Cors): Promise<Response> {
  const config = await loadConfig(db);
  // The form never waits for a slow node: past the budget the rent shown is what the node answered when last asked.
  const gated = gatedEscrows(config);
  const [trails, rent] = await Promise.all([loadTrails(db), withinMs(escrowRentLamports(gated).catch(() => null), FORM_RPC_BUDGET_MS).then((answer) => answer ?? escrowRentLastRead(gated))]);
  return json({ cluster: 'devnet', program_id: config.bounty_escrow_program ?? null, trails, limits: limits(rent) }, 200, { ...cors, 'Cache-Control': 'public, max-age=60' });
}

async function ownBounties(db: IteraClient, wallet: string): Promise<BountyRow[]> {
  const { data, error } = await db.from('bounties').select(BOUNTY_COLUMNS).eq('origin', 'wallet').eq('sponsor_wallet', wallet).order('created_at', { ascending: false }).limit(40);
  if (error) throw new Error(`bounties: ${error.message}`);
  return (data ?? []) as unknown as BountyRow[];
}

function ownView(bounty: BountyRow, claim: ClaimRow | null, now: Date, programId: string | undefined) {
  return {
    ...bountyView({ bounty, claim, lang: bounty.source_lang ?? 'en', now, functionsBase: functionsBase(), programId }),
    hidden_reason: bounty.hidden_reason,
    review: claim
      ? { status: claim.status, wallet: claim.wallet, submission_url: claim.submission_url, submission_note: claim.submission_note, submitted_at: claim.submitted_at, proof: claim.proof, proof_asset: claim.proof_asset }
      : null,
  };
}

async function list(db: IteraClient, wallet: string, cors: Cors): Promise<Response> {
  const now = new Date();
  let bounties = await ownBounties(db, wallet);
  let claims = await loadClaims(db, bounties.flatMap((bounty) => (bounty.claim_id ? [bounty.claim_id] : [])));
  if (await expireStaleClaims(db, bounties, claims, now)) {
    bounties = await ownBounties(db, wallet);
    claims = await loadClaims(db, bounties.flatMap((bounty) => (bounty.claim_id ? [bounty.claim_id] : [])));
  }
  const [config, balance] = await Promise.all([loadConfig(db), balanceOf(wallet).catch(() => null)]);
  return json(
    {
      wallet,
      balance_lamports: balance === null ? null : Number(balance),
      bounties: bounties.map((bounty) => ownView(bounty, bounty.claim_id ? (claims.get(bounty.claim_id) ?? null) : null, now, config.bounty_escrow_program)),
    },
    200,
    cors,
  );
}

async function create(db: IteraClient, caller: Caller, wallet: string, body: Record<string, unknown>, cors: Cors): Promise<Response> {
  const now = new Date();
  const parsed = parseWalletBounty(body, now);
  if (!parsed.ok) return json({ error: parsed.error }, 400, cors);
  const input = parsed.value;
  const config = await loadConfig(db);
  if (!config.bounty_wallet_tenant || !config.bounty_escrow_program || !config.collection_passports) return json({ error: 'unavailable' }, 503, cors);

  const mine = await ownBounties(db, wallet);
  if (mine.filter((bounty) => now.getTime() - Date.parse(bounty.created_at) < DAY_MS).length >= WALLET_POSTS_PER_DAY) return json({ error: 'too_many_today', limit: WALLET_POSTS_PER_DAY }, 429, cors);
  if (mine.filter((bounty) => LIVE.includes(publicStatus(bounty, now))).length >= WALLET_LIVE_BOUNTIES) return json({ error: 'too_many_live', limit: WALLET_LIVE_BOUNTIES }, 429, cors);

  const trail = (await loadTrails(db)).find((entry) => entry.unit_id === input.unit_id);
  if (!trail || input.min_days > trail.total_days) return json({ error: 'invalid_requirement' }, 400, cors);

  const id = crypto.randomUUID();
  const suffix = id.slice(0, 6);
  const slug = `${slugify(pickText(input.title_i18n, input.source_lang))}-${suffix}`;
  const requirement: Requirement = {
    program: PROGRAM_SLUG,
    unit_id: trail.unit_id,
    trail: trailAttribute(pickText(trail.title, 'en')),
    trail_title: trail.title,
    min_days: input.min_days,
    total_days: trail.total_days,
  };
  const gated = gatedEscrows(config);
  // The sponsor's wallet is the refund destination AND the approver the program records: no key of ours is in the money path.
  const escrow = await escrowPda(config.bounty_escrow_program, {
    bountyId: id,
    sponsor: wallet,
    approver: wallet,
    collection: config.collection_passports,
    amount: BigInt(input.reward_lamports),
    expiresAt: Math.floor(Date.parse(input.expires_at) / 1000),
    gate: gated ? await gateOf(requirement) : null,
  });
  const { error } = await db.from('bounties').insert({
    id,
    slug,
    tenant_id: config.bounty_wallet_tenant,
    created_by: caller.iteraUserId,
    sponsor_name: input.sponsor_name,
    title_i18n: input.title_i18n,
    summary_i18n: input.summary_i18n,
    brief_i18n: input.brief_i18n,
    deliverable_i18n: input.deliverable_i18n,
    requirement,
    reward_lamports: input.reward_lamports,
    escrow_kind: 'program',
    escrow_address: escrow,
    escrow_gated: gated,
    refund_address: wallet,
    claim_hours: input.claim_hours,
    expires_at: input.expires_at,
    origin: 'wallet',
    sponsor_wallet: wallet,
    approver_address: wallet,
    source_lang: input.source_lang,
  });
  if (error) throw new Error(`bounties insert: ${error.message}`);
  const { error: eventError } = await db.from('bounty_events').insert({ bounty_id: id, kind: 'created', wallet });
  if (eventError) console.error('bounty created event not written', id, eventError.message);
  return json({ created: true, id, slug }, 200, cors);
}

/** An unsigned transaction for the sponsor's wallet: it is the fee payer and the only signer. */
async function unsigned(wallet: string, instructions: Instruction[], memo: string, extra: Record<string, unknown>, cors: Cors): Promise<Response> {
  const latest = await latestBlockhash();
  const message = compileMessage(wallet, [...instructions, memoInstruction(memo)], latest.blockhash);
  const transaction = serializeTransaction(message);
  return json(
    {
      ...extra,
      cluster: 'devnet',
      payer: wallet,
      message_base58: base58Encode(message),
      message_base64: base64Encode(message),
      transaction_base58: base58Encode(transaction),
      transaction_base64: base64Encode(transaction),
      last_valid_block_height: latest.lastValidBlockHeight,
    },
    200,
    cors,
  );
}

async function fundTx(db: IteraClient, wallet: string, bounty: BountyRow, cors: Cors): Promise<Response> {
  if (publicStatus(bounty, new Date()) !== 'awaiting_funding') return json({ error: 'not_fundable' }, 409, cors);
  const terms = await escrowTerms(bounty, await loadConfig(db));
  if (!terms) return json({ error: 'unavailable' }, 503, cors);
  const [existing, balance, rent] = await Promise.all([readEscrow(terms.programId, bounty.escrow_address), balanceOf(wallet), escrowRentLamports(terms.gate !== null)]);
  if (existing) {
    const status = (await refreshFunding(db, bounty)).status;
    return json({ error: 'already_funded', status }, 409, cors);
  }
  const cost = BigInt(bounty.reward_lamports) + rent;
  const funds = fundsCheck(balance, cost);
  // `cost_lamports` is the total the form shows; `keep_lamports` is what Solana makes a wallet keep unless it ends at exactly zero.
  if (!funds.ok) {
    const spend = cost + BASE_FEE_LAMPORTS;
    return json({ error: 'insufficient_funds', balance_lamports: Number(balance), required_lamports: Number(funds.required), cost_lamports: Number(spend), keep_lamports: Number(funds.required - spend) }, 402, cors);
  }
  return unsigned(wallet, [createFor(terms, wallet)], transferMemo(bounty.id, 'fund'), { kind: 'fund', cost_lamports: Number(cost), rent_lamports: Number(rent), escrow: bounty.escrow_address }, cors);
}

/** Deletes a draft nobody funded: the escrow account is read first, and an account that exists means the money is in. */
async function deleteDraft(db: IteraClient, wallet: string, bounty: BountyRow, cors: Cors): Promise<Response> {
  if (draftVerdict(bounty, wallet) !== 'ok') return json({ error: 'not_a_draft', status: bounty.status }, 409, cors);
  const terms = await escrowTerms(bounty, await loadConfig(db));
  if (!terms) return json({ error: 'unavailable' }, 503, cors);
  if (await readEscrow(terms.programId, bounty.escrow_address)) {
    await refreshFunding(db, bounty).catch((error) => console.error('bounty-post: funding not refreshed', error instanceof Error ? error.message : error));
    return json({ error: 'funded' }, 409, cors);
  }
  const { count, error: claimsError } = await db.from('bounty_claims').select('id', { count: 'exact', head: true }).eq('bounty_id', bounty.id);
  if (claimsError) throw new Error(`bounty_claims: ${claimsError.message}`);
  if ((count ?? 0) > 0) return json({ error: 'not_a_draft', status: bounty.status }, 409, cors);
  for (const table of ['bounty_events', 'bounty_reports']) {
    const { error } = await db.from(table).delete().eq('bounty_id', bounty.id);
    if (error) throw new Error(`${table} delete: ${error.message}`);
  }
  const { data, error } = await db.from('bounties').delete().eq('id', bounty.id).eq('origin', 'wallet').eq('sponsor_wallet', wallet).eq('status', 'awaiting_funding').is('funded_at', null).select('id');
  if (error) throw new Error(`bounties delete: ${error.message}`);
  if (!data || data.length === 0) return json({ error: 'not_a_draft', status: bounty.status }, 409, cors);
  return json({ deleted: true, id: bounty.id }, 200, cors);
}

async function approveTx(db: IteraClient, caller: Caller, wallet: string, bounty: BountyRow, cors: Cors): Promise<Response> {
  if (bounty.status !== 'submitted') return json({ error: 'not_submitted' }, 409, cors);
  const claim = bounty.claim_id ? (await loadClaims(db, [bounty.claim_id])).get(bounty.claim_id) : undefined;
  if (!claim) return json({ error: 'not_submitted' }, 409, cors);
  // Nobody approves their own delivery.
  if (claim.user_id === caller.iteraUserId || claim.wallet === wallet) return json({ error: 'self_review' }, 403, cors);
  const terms = await escrowTerms(bounty, await loadConfig(db));
  if (!terms) return json({ error: 'unavailable' }, 503, cors);
  const state = await readEscrow(terms.programId, bounty.escrow_address);
  if (state?.status === 'paid') return json({ error: 'already_paid', status: await recordWalletPayout(db, bounty.id, { reviewer: caller.iteraUserId, note: null }) }, 409, cors);
  // The program pays only the claimant its account names. If the account does not name this learner, there is nothing to sign.
  if (state?.status !== 'claimed' || state.claimant !== claim.wallet) return json({ error: 'chain_mismatch', chain_status: state?.status ?? null }, 409, cors);
  return unsigned(
    wallet,
    [releaseInstruction({ programId: terms.programId, approver: wallet, escrow: bounty.escrow_address, claimant: claim.wallet })],
    transferMemo(bounty.id, 'payout'),
    { kind: 'approve', pays: claim.wallet, lamports: Number(state.amount) },
    cors,
  );
}

async function reject(db: IteraClient, caller: Caller, bounty: BountyRow, body: Record<string, unknown>, cors: Cors): Promise<Response> {
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 1000) : null;
  if (bounty.status !== 'submitted') return json({ error: 'not_submitted' }, 409, cors);
  const { data, error } = await db.rpc('bounty_review', { p_bounty: bounty.id, p_reviewer: caller.iteraUserId, p_approve: false, p_note: note });
  if (error) throw new Error(`bounty_review: ${error.message}`);
  if (data !== 'ok') return json({ error: 'not_submitted' }, 409, cors);
  // The escrow account still names the learner: the attester reopens it, so the page and the account agree.
  const claim = bounty.claim_id ? (await loadClaims(db, [bounty.claim_id])).get(bounty.claim_id) : undefined;
  const reopened = claim ? await unclaimOnChain(db, bounty, 'rejected', claim) : null;
  return json({ rejected: true, status: 'open', unclaim_signature: reopened }, 200, cors);
}

async function refundTx(db: IteraClient, wallet: string, bounty: BountyRow, cors: Cors): Promise<Response> {
  if (bounty.status !== 'open' && bounty.status !== 'refunding') return json({ error: 'not_refundable', status: bounty.status }, 409, cors);
  const terms = await escrowTerms(bounty, await loadConfig(db));
  if (!terms) return json({ error: 'unavailable' }, 503, cors);
  const state = await readEscrow(terms.programId, bounty.escrow_address);
  if (!state) return json({ error: 'not_refundable', status: bounty.status }, 409, cors);
  // Signed by the sponsor's own wallet, which the program accepts as the bounty's sponsor and approver.
  const plan = refundPlan(state, { ...terms, attester: wallet });
  if (plan === 'done') {
    await syncWithEscrow(db, bounty.id);
    return json({ error: 'already_refunded', status: (await loadBounty(db, { id: bounty.id }))?.status }, 409, cors);
  }
  if (plan === 'closed') return json({ error: 'not_refundable', status: bounty.status }, 409, cors);
  return unsigned(wallet, plan, transferMemo(bounty.id, 'refund'), { kind: 'refund', lamports: Number(state.amount) }, cors);
}

/**
 * The fallback for a wallet that signs and does not send: this hands the signed transaction to the node. It only
 * relays a transaction the sponsor's own wallet signed and that touches this bounty's escrow account on the
 * escrow program: it is not a general relay.
 */
async function submit(db: IteraClient, wallet: string, bounty: BountyRow, body: Record<string, unknown>, cors: Cors): Promise<Response> {
  const transaction = decodeSignedTransaction(body.signed_transaction);
  const program = (await loadConfig(db)).bounty_escrow_program;
  if (!transaction || !program) return json({ error: 'invalid_transaction' }, 400, cors);
  const feePayer = base58Decode(transaction.accountKeys[0], 32);
  if (transaction.accountKeys[0] !== wallet || !feePayer || !(await verifyEd25519(feePayer, transaction.signatures[0], transaction.message))) return json({ error: 'signature_invalid' }, 422, cors);
  if (!transaction.accountKeys.includes(bounty.escrow_address) || !transaction.accountKeys.includes(program)) return json({ error: 'invalid_transaction' }, 400, cors);
  const signature = transactionSignature(transaction);
  try {
    await rpc<string>('sendTransaction', [base64Encode(transaction.bytes), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
  } catch (error) {
    if (!(error instanceof RpcNodeError)) throw error;
    if (!/already been processed|already processed/i.test(error.nodeMessage)) return json({ error: 'broadcast_failed', detail: error.nodeMessage.slice(0, 200) }, 422, cors);
  }
  return json({ sent: true, signature }, 200, cors);
}

/** After the wallet sent a transaction: the escrow account decides what happened, never the request. */
async function confirm(db: IteraClient, caller: Caller, bounty: BountyRow, body: Record<string, unknown>, cors: Cors): Promise<Response> {
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 1000) : null;
  const before = bounty.status;
  const deadline = Date.now() + CONFIRM_WAIT_MS;
  let status: string | null = before;
  for (;;) {
    if (before === 'awaiting_funding') status = (await refreshFunding(db, bounty)).status;
    else if (before === 'submitted' || before === 'paying') status = await recordWalletPayout(db, bounty.id, { reviewer: caller.iteraUserId, note });
    else if (before === 'open' || before === 'refunding') {
      await syncWithEscrow(db, bounty.id);
      const after = await loadBounty(db, { id: bounty.id });
      status = after?.status === 'refunding' ? 'refunding' : (after?.status ?? null);
    }
    if (status !== before || Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_POLL_MS));
  }
  const after = await loadBounty(db, { id: bounty.id });
  return json(
    { status: after?.status ?? status, changed: (after?.status ?? status) !== before, payout_signature: after?.payout_signature ?? null, refund_signature: after?.refund_signature ?? null, funding_signature: after?.funding_signature ?? null },
    200,
    cors,
  );
}

async function report(db: IteraClient, caller: Caller, bounty: BountyRow, body: Record<string, unknown>, cors: Cors): Promise<Response> {
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 300) return json({ error: 'invalid_reason' }, 400, cors);
  const { error } = await db.from('bounty_reports').upsert({ bounty_id: bounty.id, reporter_id: caller.iteraUserId, reason }, { onConflict: 'bounty_id,reporter_id', ignoreDuplicates: true });
  if (error) throw new Error(`bounty_reports: ${error.message}`);
  return json({ reported: true }, 200, cors);
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app', 'GET, POST, OPTIONS');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const db = serviceClient();
    if (request.method === 'GET') {
      const verdict = await takeRate(db, FUNCTION, callerAddress(request), READ_RATE);
      return verdict.allowed ? await options(db, cors) : tooMany(verdict, cors);
    }
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
    const caller = await resolveCaller(db, request);
    if (typeof caller === 'string') return json({ error: caller }, callerFailureStatus(caller), cors);
    const verdict = await takeRate(db, `${FUNCTION}:write`, caller.iteraUserId, WRITE_RATE);
    if (!verdict.allowed) return tooMany(verdict, cors);
    const body = await readJsonObject(request, 16_384);
    if (!body) return json({ error: 'invalid_body' }, 400, cors);

    if (body.action === 'report') {
      const reported = typeof body.bounty === 'string' && isUuid(body.bounty) ? await loadBounty(db, { id: body.bounty }) : null;
      return reported ? await report(db, caller, reported, body, cors) : json({ error: 'bounty_not_found' }, 404, cors);
    }

    // Everything below acts for a wallet: the one the sign-in itself proved, never one named in the request.
    const wallet = caller.wallet;
    if (!wallet) return json({ error: 'no_wallet' }, 403, cors);
    if (body.action === 'list') return await list(db, wallet, cors);
    if (body.action === 'create') return await create(db, caller, wallet, body, cors);

    const bountyId = body.bounty;
    if (typeof bountyId !== 'string' || !isUuid(bountyId)) return json({ error: 'invalid_body' }, 400, cors);
    const bounty = await loadBounty(db, { id: bountyId });
    // A bounty another wallet posted is not this caller's to act on.
    if (!bounty || bounty.origin !== 'wallet' || bounty.sponsor_wallet !== wallet) return json({ error: 'bounty_not_found' }, 404, cors);

    if (body.action === 'fund_tx') return await fundTx(db, wallet, bounty, cors);
    if (body.action === 'delete') return await deleteDraft(db, wallet, bounty, cors);
    if (body.action === 'approve_tx') return await approveTx(db, caller, wallet, bounty, cors);
    if (body.action === 'refund_tx') return await refundTx(db, wallet, bounty, cors);
    if (body.action === 'reject') return await reject(db, caller, bounty, body, cors);
    if (body.action === 'submit') return await submit(db, wallet, bounty, body, cors);
    if (body.action === 'confirm') return await confirm(db, caller, bounty, body, cors);
    return json({ error: 'invalid_action' }, 400, cors);
  } catch (error) {
    if (error instanceof RpcError) {
      console.error('bounty-post rpc failed', error.message);
      return json({ error: 'upstream_unavailable' }, 502, cors);
    }
    console.error('bounty-post failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
