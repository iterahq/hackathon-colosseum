import { loadAvatarCatalog, supabaseUrl } from '../_shared/avatar-store.ts';
import { DEFAULT_AVATAR_KEY, avatarView, fallbackAvatarView, resolveAvatar, type AvatarCatalog } from '../_shared/avatars.ts';
import { ITERA_V2_GRAPH, graphOf } from '../_shared/capability-graph.ts';
import { callerFailureStatus, resolveCaller, type Caller } from '../_shared/caller.ts';
import { pickText } from '../_shared/credential.ts';
import { serviceClient, type IteraClient } from '../_shared/db.ts';
import { cleanName, publicLabel } from '../_shared/gift.ts';
import { corsHeaders, json, langOf, readJsonObject } from '../_shared/http.ts';
import { callerAddress, takeRate, tooMany, type RateLimit } from '../_shared/ratelimit.ts';
import { BOARD_LIMIT, capabilityOptions, certificationFacts, filterCards, listVerdict, orderCards, parseFilter, parseHeadline, type CertificationFacts, type TalentCard } from '../_shared/talent.ts';
import { loadTestAccountIds } from '../_shared/test-accounts.ts';

type Cors = Record<string, string>;
type Lang = 'pt' | 'en';
const FUNCTION = 'talent-board';
const READ_RATE: RateLimit = { limit: 60, windowMs: 60_000 };
const WRITE_RATE: RateLimit = { limit: 30, windowMs: 60_000 };
const LISTING_COLUMNS = 'user_id,wallet,headline,listed_at,updated_at';
const LISTING_SCAN = 300;

interface ListingRow {
  user_id: string;
  wallet: string;
  headline: string | null;
  listed_at: string;
  updated_at: string;
}

interface CertificationRow {
  id: string;
  user_id: string;
  earned_at: string | null;
  state: Record<string, unknown>;
}

interface ProofRow {
  user_achievement_id: string;
  claim_id: string;
  tx_signature: string | null;
  proven_at: string;
}

function ok<T>(result: { data: T | null; error: { message: string } | null }, label: string): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return (result.data ?? []) as T;
}

async function certificationsOf(db: IteraClient, userIds: string[]): Promise<CertificationRow[]> {
  if (userIds.length === 0) return [];
  const result = await db.from('user_achievements').select('id,user_id,earned_at,state').in('user_id', userIds).eq('achievement_key', 'trail_pass').eq('mint_status', 'minted').not('asset_address', 'is', null);
  return ok<CertificationRow[]>(result as never, 'user_achievements');
}

async function listingOf(db: IteraClient, userId: string): Promise<ListingRow | null> {
  const { data, error } = await db.from('talent_listings').select(LISTING_COLUMNS).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`talent_listings: ${error.message}`);
  return data as ListingRow | null;
}

function avatarOf(catalog: AvatarCatalog | null, key: string | null, owned: Set<string>, lang: Lang): TalentCard['avatar'] {
  const base = supabaseUrl();
  const view = (() => {
    if (!catalog) return fallbackAvatarView(base);
    let item = resolveAvatar(catalog, key);
    if (item && item.price_lamports !== null && !owned.has(item.key)) item = resolveAvatar(catalog, DEFAULT_AVATAR_KEY);
    return item ? avatarView(catalog, item, lang, base, null) : fallbackAvatarView(base);
  })();
  return { key: view.key, title: view.title, thumb_url: view.thumb_url, rarity: view.rarity };
}

const GRAPH_ORDER = ITERA_V2_GRAPH.claims.map((entry) => entry.id);
const order = (key: string) => { const index = GRAPH_ORDER.indexOf(key); return index < 0 ? GRAPH_ORDER.length : index; };

async function loadCards(db: IteraClient, lang: Lang): Promise<TalentCard[]> {
  const listings = ok<ListingRow[]>((await db.from('talent_listings').select(LISTING_COLUMNS).order('listed_at', { ascending: false }).limit(LISTING_SCAN)) as never, 'talent_listings');
  if (listings.length === 0) return [];
  const userIds = listings.map((row) => row.user_id);
  const wallets = listings.map((row) => row.wallet);
  const [users, linked, companions, ownedAvatars, certifications, paid, tests, catalog] = await Promise.all([
    db.from('users').select('id,display_name').in('id', userIds),
    db.from('user_wallets').select('user_id').in('user_id', userIds),
    db.from('companions').select('user_id,avatar').in('user_id', userIds),
    db.from('avatar_assets').select('user_id,item_key,mint_status').in('user_id', userIds).eq('mint_status', 'minted'),
    certificationsOf(db, userIds),
    db.from('bounties').select('paid_wallet,payout_lamports').eq('status', 'paid').not('payout_signature', 'is', null).in('paid_wallet', wallets),
    loadTestAccountIds(db),
    loadAvatarCatalog(db).catch(() => null),
  ]);
  const proofs = certifications.length > 0 ? ok<ProofRow[]>((await db.from('claim_proofs').select('user_achievement_id,claim_id,tx_signature,proven_at').in('user_achievement_id', certifications.map((row) => row.id))) as never, 'claim_proofs') : [];

  const nameOf = new Map(ok<Array<{ id: string; display_name: string | null }>>(users as never, 'users').map((row) => [row.id, row.display_name]));
  // A wallet bound to an e-mail account: its display name may be a real name, so it is never shown.
  const emailAccounts = new Set(ok<Array<{ user_id: string }>>(linked as never, 'user_wallets').map((row) => row.user_id));
  const avatarOf_ = new Map(ok<Array<{ user_id: string; avatar: string | null }>>(companions as never, 'companions').map((row) => [row.user_id, row.avatar]));
  const ownedBy = new Map<string, Set<string>>();
  for (const row of ok<Array<{ user_id: string; item_key: string; mint_status: string }>>(ownedAvatars as never, 'avatar_assets')) {
    ownedBy.set(row.user_id, (ownedBy.get(row.user_id) ?? new Set()).add(row.item_key));
  }
  const paidBy = new Map<string, { count: number; lamports: number }>();
  for (const row of ok<Array<{ paid_wallet: string; payout_lamports: number | null }>>(paid as never, 'bounties')) {
    const current = paidBy.get(row.paid_wallet) ?? { count: 0, lamports: 0 };
    paidBy.set(row.paid_wallet, { count: current.count + 1, lamports: current.lamports + (row.payout_lamports ?? 0) });
  }
  const proofsOf = new Map<string, ProofRow[]>();
  for (const proof of proofs) proofsOf.set(proof.user_achievement_id, [...(proofsOf.get(proof.user_achievement_id) ?? []), proof]);

  return listings.map((listing) => {
    const rows = certifications.filter((row) => row.user_id === listing.user_id);
    const facts = rows.map((row) => certificationFacts(row.state));
    const written = new Map<string, { title: string; at: string }>();
    let lastStamp: string | null = null;
    for (const row of rows) {
      const graph = graphOf(row.state.program_slug);
      for (const proof of proofsOf.get(row.id) ?? []) {
        if (!lastStamp || proof.proven_at > lastStamp) lastStamp = proof.proven_at;
        const claim = graph?.claims.find((entry) => entry.id === proof.claim_id);
        if (claim && proof.tx_signature && !written.has(claim.id)) written.set(claim.id, { title: pickText(claim.title, lang), at: proof.proven_at });
      }
      if (!lastStamp && row.earned_at) lastStamp = row.earned_at;
    }
    const money = paidBy.get(listing.wallet) ?? { count: 0, lamports: 0 };
    const typed = emailAccounts.has(listing.user_id) ? null : cleanName(nameOf.get(listing.user_id));
    return {
      wallet: listing.wallet,
      name: typed === null ? null : publicLabel(typed, listing.wallet, lang),
      avatar: avatarOf(catalog, avatarOf_.get(listing.user_id) ?? null, ownedBy.get(listing.user_id) ?? new Set(), lang),
      headline: listing.headline,
      stamped_days: facts.reduce((sum, entry) => sum + entry.stamped_days, 0),
      total_days: facts.reduce((sum, entry) => sum + entry.total_days, 0),
      certifications: rows.length,
      capabilities: [...written].map(([key, value]) => ({ key, title: value.title })).sort((a, b) => order(a.key) - order(b.key)),
      bounties_paid: money.count,
      bounties_paid_lamports: money.lamports,
      last_stamp_at: lastStamp,
      profile_url: `/u/${listing.wallet}`,
      team_test: tests.has(listing.user_id),
    };
  });
}

async function board(db: IteraClient, request: Request, cors: Cors): Promise<Response> {
  const lang = langOf(request, 'pt');
  const filter = parseFilter(new URL(request.url).searchParams);
  const all = orderCards((await loadCards(db, lang)).filter((card) => card.stamped_days > 0));
  const shown = filterCards(all, filter).slice(0, BOARD_LIMIT);
  return json(
    {
      source: 'recorded',
      read_at: new Date().toISOString(),
      total_listed: all.length,
      filter: { capability: filter.capability, min_days: filter.minDays },
      capabilities: capabilityOptions(all, GRAPH_ORDER),
      learners: shown,
    },
    200,
    { ...cors, 'Cache-Control': 'public, max-age=15' },
  );
}

async function statusOf(db: IteraClient, caller: Caller, listing: ListingRow | null) {
  const facts: CertificationFacts[] = (await certificationsOf(db, [caller.iteraUserId])).map((row) => certificationFacts(row.state));
  const verdict = listVerdict(caller.wallet, facts);
  return {
    wallet: caller.wallet,
    listed: listing !== null,
    listing: listing && { headline: listing.headline, listed_at: listing.listed_at, updated_at: listing.updated_at },
    may_list: verdict.may_list,
    reason: verdict.reason,
    stamped_days: facts.reduce((sum, entry) => sum + entry.stamped_days, 0),
    total_days: facts.reduce((sum, entry) => sum + entry.total_days, 0),
    certifications: facts.length,
  };
}

async function list(db: IteraClient, caller: Caller, body: Record<string, unknown>, cors: Cors): Promise<Response> {
  const headline = parseHeadline(body.headline);
  if (!headline.ok) return json({ error: headline.error }, 400, cors);
  const current = await listingOf(db, caller.iteraUserId);
  const status = await statusOf(db, caller, current);
  if (!status.may_list || !caller.wallet) return json({ error: status.reason ?? 'no_wallet' }, 403, cors);
  const now = new Date().toISOString();
  const { error } = await db.from('talent_listings').upsert({ user_id: caller.iteraUserId, wallet: caller.wallet, headline: headline.value, updated_at: now, ...(current ? {} : { listed_at: now }) }, { onConflict: 'user_id' });
  if (error) {
    if (error.code === '23505') return json({ error: 'wallet_taken' }, 409, cors);
    throw new Error(`talent_listings upsert: ${error.message}`);
  }
  return json(await statusOf(db, caller, await listingOf(db, caller.iteraUserId)), 200, cors);
}

async function unlist(db: IteraClient, caller: Caller, cors: Cors): Promise<Response> {
  const { error } = await db.from('talent_listings').delete().eq('user_id', caller.iteraUserId);
  if (error) throw new Error(`talent_listings delete: ${error.message}`);
  return json(await statusOf(db, caller, null), 200, cors);
}

Deno.serve(async (request) => {
  const wantsPost = request.method === 'POST' || request.headers.get('access-control-request-method') === 'POST';
  const cors = wantsPost ? corsHeaders(request, 'app', 'GET, POST, OPTIONS') : corsHeaders(request, 'public');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const db = serviceClient();
    if (request.method === 'GET') {
      const verdict = await takeRate(db, FUNCTION, callerAddress(request), READ_RATE);
      return verdict.allowed ? await board(db, request, cors) : tooMany(verdict, cors);
    }
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
    const caller = await resolveCaller(db, request);
    if (typeof caller === 'string') return json({ error: caller }, callerFailureStatus(caller), cors);
    const verdict = await takeRate(db, `${FUNCTION}:write`, caller.iteraUserId, WRITE_RATE);
    if (!verdict.allowed) return tooMany(verdict, cors);
    const body = await readJsonObject(request, 2_048);
    if (!body) return json({ error: 'invalid_body' }, 400, cors);
    if (body.action === 'status') return json(await statusOf(db, caller, await listingOf(db, caller.iteraUserId)), 200, cors);
    if (body.action === 'list') return await list(db, caller, body, cors);
    if (body.action === 'unlist') return await unlist(db, caller, cors);
    return json({ error: 'invalid_action' }, 400, cors);
  } catch (error) {
    console.error('talent-board failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
