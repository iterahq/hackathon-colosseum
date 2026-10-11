import { isSolanaAddress } from '../_shared/address.ts';
import { BOUNTY_COLUMNS, expireStaleClaims, landedSignatures, listBounties, loadBounty, loadClaims, loadEvents, refreshFunding } from '../_shared/bounty-store.ts';
import { boardStats, bountyView, earningsView, type BountyRow } from '../_shared/bounty.ts';
import { loadConfig, serviceClient, type IteraClient } from '../_shared/db.ts';
import { corsHeaders, functionsBase, isUuid, json, langOf, pathAfter } from '../_shared/http.ts';
import { RpcError } from '../_shared/rpc.ts';

const FUNCTION = 'bounty-board';
const SLUG = /^[a-z0-9][a-z0-9-]{2,62}$/;

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

async function board(db: IteraClient, request: Request, cors: Record<string, string>): Promise<Response> {
  const now = new Date();
  const lang = langOf(request, 'pt');
  const [{ bounties, claims }, config] = await Promise.all([currentBounties(db, now), loadConfig(db)]);
  return json(
    {
      cluster: 'devnet',
      stats: boardStats(bounties, now),
      bounties: bounties.map((bounty) => bountyView({ bounty, claim: bounty.claim_id ? (claims.get(bounty.claim_id) ?? null) : null, lang, now, functionsBase: functionsBase(), programId: config.bounty_escrow_program })),
    },
    200,
    { ...cors, 'Cache-Control': 'public, max-age=10' },
  );
}

async function detail(db: IteraClient, request: Request, key: string, cors: Record<string, string>): Promise<Response> {
  const now = new Date();
  let bounty: BountyRow | null = await loadBounty(db, isUuid(key) ? { id: key } : { slug: key });
  if (!bounty) return json({ error: 'bounty_not_found' }, 404, cors);
  let claims = await loadClaims(db, bounty.claim_id ? [bounty.claim_id] : []);
  if (await expireStaleClaims(db, [bounty], claims, now)) {
    bounty = (await loadBounty(db, { id: bounty.id })) ?? bounty;
    claims = new Map();
  }
  // A bounty someone just funded opens on the next read: the balance of its escrow account decides.
  if (bounty.status === 'awaiting_funding') bounty = await refreshFunding(db, bounty).catch(() => bounty as BountyRow);
  const [events, config] = await Promise.all([loadEvents(db, bounty.id), loadConfig(db)]);
  return json(
    bountyView({ bounty, claim: bounty.claim_id ? (claims.get(bounty.claim_id) ?? null) : null, events, lang: langOf(request, 'pt'), now, functionsBase: functionsBase(), programId: config.bounty_escrow_program }),
    200,
    { ...cors, 'Cache-Control': 'no-store' },
  );
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
    if (rest.length > 0) return json({ error: 'not_found' }, 404, cors);
    if (first === undefined) return await board(db, request, cors);
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
