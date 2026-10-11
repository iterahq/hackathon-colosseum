import { loadTestAccountIds } from '../_shared/test-accounts.ts';
import { isSolanaAddress } from '../_shared/address.ts';
import { BOUNTY_COLUMNS, expireStaleClaims, inBackground, recordWalletPayout, settleTransfer, sweepExpired, syncOpenEscrows, syncWithEscrow, landedSignatures, listBounties, loadBounty, loadClaims, loadEvents, refreshFunding } from '../_shared/bounty-store.ts';
import { boardStats, bountyView, collapseJudgeBounties, earningsView, publicStatus, type BountyRow, type ClaimRow } from '../_shared/bounty.ts';
import { countOpenEscrows } from '../_shared/bounty-chain.ts';
import { judgeHistory, refillTemplates, settleJudged } from '../_shared/bounty-judge.ts';
import { loadConfig, serviceClient, type IteraClient } from '../_shared/db.ts';
import { corsHeaders, functionsBase, isUuid, json, langOf, pathAfter } from '../_shared/http.ts';
import { callerAddress, takeRate, tooMany, type RateLimit } from '../_shared/ratelimit.ts';
import { RpcError, withinMs } from '../_shared/rpc.ts';

const FUNCTION = 'bounty-board';
const SLUG = /^[a-z0-9][a-z0-9-]{2,62}$/;
const RATE: RateLimit = { limit: 120, windowMs: 60_000 };
const SWEEP_ON_READ = 1;
const SWEEP_ON_SCHEDULE = 4;
/**
 * How long a read of the board or of a bounty waits for the Solana node. Past it the answer is what the
 * tables hold (the previous read of the chain), it says so (`chain_read: false`), and the read of the
 * chain goes on behind the answer so the next one has it.
 */
const CHAIN_BUDGET_MS = 2_500;

/** `true` when the work finished inside the budget; otherwise it is left running behind the answer. */
async function chainStep(work: Promise<unknown>, label: string): Promise<boolean> {
  const guarded = work.then(() => true as const).catch((error) => {
    console.error(`bounty-board: ${label}`, error instanceof Error ? error.message : error);
    return false as const;
  });
  const done = await withinMs(guarded, CHAIN_BUDGET_MS);
  if (done === null) inBackground(guarded);
  return done === true;
}

/** The board as it stands now: a learner who ran out of time no longer holds a bounty. */
async function currentBounties(db: IteraClient, now: Date) {
  let bounties = await listBounties(db);
  let claims = await loadClaims(db, bounties.flatMap((bounty) => (bounty.claim_id ? [bounty.claim_id] : [])));
  if (await expireStaleClaims(db, bounties, claims, now)) {
    bounties = await listBounties(db);
    claims = await loadClaims(db, bounties.flatMap((bounty) => (bounty.claim_id ? [bounty.claim_id] : [])));
  }
  return { bounties, claims };
}

/** Paid bounties whose payee is one of the team's own test accounts: rehearsals, labelled as such wherever they show. */
function rehearsalIds(bounties: BountyRow[], claims: Map<string, ClaimRow>, tests: Set<string>): Set<string> {
  return new Set(bounties.filter((bounty) => bounty.status === 'paid' && bounty.claim_id && tests.has(claims.get(bounty.claim_id)?.user_id ?? '')).map((bounty) => bounty.id));
}

/** Bounties posted by a wallet of one of the team's own test accounts: labelled as the team's, never as an outside sponsor. */
function teamTestSponsored(bounties: BountyRow[], tests: Set<string>): Set<string> {
  return new Set(bounties.filter((bounty) => bounty.origin === 'wallet' && tests.has(bounty.created_by ?? '')).map((bounty) => bounty.id));
}

async function board(db: IteraClient, request: Request, cors: Record<string, string>): Promise<Response> {
  const now = new Date();
  const lang = langOf(request, 'pt');
  // A bounty past its date goes back to its sponsor without anyone asking: this read sets it off, after answering.
  inBackground(sweepExpired(db, now, SWEEP_ON_READ));
  // Before the board says "open" and counts money as locked, the escrow accounts are read: one call for all of them.
  const chainRead = await chainStep(syncOpenEscrows(db), 'escrow accounts not read');
  const [{ bounties, claims }, config, tests] = await Promise.all([currentBounties(db, now), loadConfig(db), loadTestAccountIds(db)]);
  const rehearsals = rehearsalIds(bounties, claims, tests);
  const teamTests = teamTestSponsored(bounties, tests);
  const [judged, openOnChain] = await Promise.all([
    judgeHistory(db, tests),
    // The escrow accounts the chain shows as open, whether or not the board lists them: the difference is said, not hidden.
    config.bounty_escrow_program ? withinMs(countOpenEscrows(config.bounty_escrow_program).catch(() => null), CHAIN_BUDGET_MS) : null,
  ]);
  const live = bounties.filter((bounty) => ['open', 'claimed', 'submitted', 'paying'].includes(publicStatus(bounty, now)));
  // The judge bounty is one card, whatever the number of escrow accounts behind it; the counts above still count every account.
  const { listed, slots } = collapseJudgeBounties(bounties, now);
  const listedOpen = bounties.filter((bounty) => bounty.escrow_kind === 'program' && bounty.status === 'open').length;
  return json(
    {
      cluster: 'devnet',
      read_at: now.toISOString(),
      /** The escrow accounts were read from Solana for this answer; `false`: the node was slow and this is the previous read. */
      chain_read: chainRead,
      stats: {
        ...boardStats(bounties, now, rehearsals, teamTests, judged),
        listed_count: live.length,
        open_on_chain_count: openOnChain,
        hidden_test_count: openOnChain === null ? null : Math.max(0, openOnChain - listedOpen),
        // Of the bounties that can still be taken or are held: how many have the days in the escrow's own terms, and how many rely on Itera's attester.
        days_by_program_count: live.filter((bounty) => bounty.escrow_kind === 'program' && bounty.escrow_gated).length,
        days_by_attester_count: live.filter((bounty) => !(bounty.escrow_kind === 'program' && bounty.escrow_gated)).length,
      },
      judge: { paid_count: judged.count, team_test_paid_count: judged.team_test_count, latest: judged.latest },
      bounties: listed.map((bounty) =>
        bountyView({ bounty, claim: bounty.claim_id ? (claims.get(bounty.claim_id) ?? null) : null, lang, now, functionsBase: functionsBase(), programId: config.bounty_escrow_program, rehearsal: rehearsals.has(bounty.id), teamTestSponsor: teamTests.has(bounty.id), judgeSlots: slots.get(bounty.id) }),
      ),
    },
    200,
    { ...cors, 'Cache-Control': 'public, max-age=5' },
  );
}

async function detail(db: IteraClient, request: Request, key: string, cors: Record<string, string>): Promise<Response> {
  const now = new Date();
  let bounty: BountyRow | null = await loadBounty(db, isUuid(key) ? { id: key } : { slug: key });
  if (!bounty) return json({ error: 'bounty_not_found' }, 404, cors);
  let claims = await loadClaims(db, bounty.claim_id ? [bounty.claim_id] : []);
  let chainRead = true;
  if (await expireStaleClaims(db, [bounty], claims, now)) {
    bounty = (await loadBounty(db, { id: bounty.id })) ?? bounty;
    claims = new Map();
  }
  // An open bounty is only shown as open, and a held one as held, after its escrow account was read.
  if ((bounty.status === 'open' || bounty.status === 'claimed') && bounty.escrow_kind === 'program') {
    chainRead = await chainStep(syncWithEscrow(db, bounty.id), 'escrow account not read');
    bounty = (await loadBounty(db, { id: bounty.id })) ?? bounty;
  }
  // A bounty someone just funded opens on the next read: the balance of its escrow account decides.
  if (bounty.status === 'awaiting_funding') {
    const draft = bounty;
    bounty = (await withinMs(refreshFunding(db, draft).catch(() => draft), CHAIN_BUDGET_MS)) ?? draft;
  }
  // A sponsor's wallet may have paid straight on the program: the page says paid as soon as the account does.
  // A delivery the check approved whose payout was not seen confirmed: this read finishes it.
  if (bounty.auto_check && bounty.status === 'paying') {
    await chainStep(settleTransfer(db, bounty.id), 'judge payout not settled');
    bounty = (await loadBounty(db, { id: bounty.id })) ?? bounty;
  }
  if (bounty.origin === 'wallet' && (bounty.status === 'submitted' || bounty.status === 'paying')) {
    await chainStep(recordWalletPayout(db, bounty.id), 'payout not recorded');
    bounty = (await loadBounty(db, { id: bounty.id })) ?? bounty;
  }
  const [events, config, tests, freeSlug] = await Promise.all([
    loadEvents(db, bounty.id),
    loadConfig(db),
    bounty.status === 'paid' || bounty.origin === 'wallet' ? loadTestAccountIds(db) : new Set<string>(),
    // A judge bounty someone holds: the page points at a free one of the same task.
    bounty.template_key && bounty.status !== 'open' ? freeJudgeSlug(db, bounty, langOf(request, 'pt')) : null,
  ]);
  return json(
    { chain_read: chainRead, ...bountyView({ judgeFreeSlug: freeSlug, bounty, claim: bounty.claim_id ? (claims.get(bounty.claim_id) ?? null) : null, events, lang: langOf(request, 'pt'), now, functionsBase: functionsBase(), programId: config.bounty_escrow_program, rehearsal: rehearsalIds([bounty], claims, tests).has(bounty.id), teamTestSponsor: teamTestSponsored([bounty], tests).has(bounty.id) }) },
    200,
    { ...cors, 'Cache-Control': 'no-store' },
  );
}

/** A free bounty of the same judge template, oldest first; `null` when every one is held. */
async function freeJudgeSlug(db: IteraClient, bounty: BountyRow, lang: 'pt' | 'en'): Promise<string | null> {
  const { data, error } = await db
    .from('bounties')
    .select('slug,slug_en')
    .eq('template_key', bounty.template_key as string)
    .eq('status', 'open')
    .eq('is_test', false)
    .is('hidden_at', null)
    .gt('expires_at', new Date().toISOString())
    .neq('id', bounty.id)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { slug: string; slug_en: string | null };
  return lang === 'en' && row.slug_en ? row.slug_en : row.slug;
}

/** What a wallet earned from bounties. Each payout is checked against the chain before it counts. */
async function earnings(db: IteraClient, request: Request, wallet: string, cors: Record<string, string>): Promise<Response> {
  const { data, error } = await db.from('bounties').select(BOUNTY_COLUMNS).eq('status', 'paid').eq('paid_wallet', wallet).order('paid_at', { ascending: false }).limit(50);
  if (error) throw new Error(`bounties: ${error.message}`);
  const bounties = (data ?? []) as unknown as BountyRow[];
  const landed = await landedSignatures(bounties.flatMap((bounty) => (bounty.payout_signature ? [bounty.payout_signature] : [])));
  return json(earningsView({ wallet, bounties, landed, lang: langOf(request, 'pt') }), 200, { ...cors, 'Cache-Control': 'public, max-age=20' });
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'public');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);
  try {
    const [first, second, ...rest] = pathAfter(request, FUNCTION);
    const db = serviceClient();
    const verdict = await takeRate(db, FUNCTION, callerAddress(request), RATE);
    if (!verdict.allowed) return tooMany(verdict, cors);
    if (rest.length > 0) return json({ error: 'not_found' }, 404, cors);
    if (first === undefined) return await board(db, request, cors);
    // The scheduler's door (`0202_bounty_refund_schedule.sql`). Public on purpose: all it can do is return expired money to its sponsor.
    if (first === 'sweep' && second === undefined) {
      // The same schedule keeps the judge bounties available: paid ones are replaced from the treasury.
      inBackground(sweepExpired(db, new Date(), SWEEP_ON_SCHEDULE).then(() => settleJudged(db, SWEEP_ON_SCHEDULE)).then(() => refillTemplates(db, new Date())));
      return json({ sweeping: true }, 202, { ...cors, 'Cache-Control': 'no-store' });
    }
    if (first === 'wallet') {
      if (!isSolanaAddress(second)) return json({ error: 'invalid_address' }, 400, cors);
      return await earnings(db, request, second, cors);
    }
    if (second !== undefined || !(isUuid(first) || SLUG.test(first))) return json({ error: 'bounty_not_found' }, 404, cors);
    return await detail(db, request, first, cors);
  } catch (error) {
    if (error instanceof RpcError) {
      console.error('bounty-board rpc failed', error.message);
      return json({ error: 'upstream_unavailable' }, 502, cors);
    }
    console.error('bounty-board failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
