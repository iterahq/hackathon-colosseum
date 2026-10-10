import { computeAwards, dayIncomplete, dayPendingReview, type Award, type AwardsInput } from '../_shared/awards.ts';
import { linkedWalletOf, resolveWallet, walletOf } from '../_shared/caller.ts';
import type { Chain } from '../_shared/chain.ts';
import { COLLECTIONS, type CollectionKind } from '../_shared/chain-names.ts';
import {
  CLUSTER,
  assetName,
  explorerUrl,
  imageUrl,
  metadataUrl,
  onchainAttributes,
  pickText,
  tierOf,
  type AchievementRow,
  type CatalogEntry,
} from '../_shared/credential.ts';
import { restoreCosmetics } from '../_shared/cosmetics-store.ts';
import { CATALOG_COLUMNS, ROW_COLUMNS, loadConfig, serviceClient, type IteraClient } from '../_shared/db.ts';
import { bearerToken, corsHeaders, functionsBase, isUuid, json } from '../_shared/http.ts';
import { planMintJobs, type MintJob } from '../_shared/mint-plan.ts';
import { inBackground, syncMirror } from '../_shared/companion-store.ts';
import { rewardReferral } from '../_shared/referral-store.ts';
import { referralNote } from '../_shared/referral.ts';

const TIME_ZONE = 'America/Sao_Paulo';
const MAX_JOBS_PER_CALL = 3;
const MAX_OPERATOR_JOBS = 10;
const MINT_BUDGET_MS = 90_000;
const STALE_CLAIM_MS = 3 * 60_000;
const INVITER_MINT_ATTEMPTS = 3;
const INVITER_MINT_PAUSE_MS = 3_000;
const PAGE_SIZE = 1000;
const ROW_KEY = 'user_id,achievement_key,ref_id';

type Lang = 'pt' | 'en';
type ChainSdk = typeof import('../_shared/chain.ts');
type MintBlock = 'no_wallet' | 'authority_not_configured' | 'authority_unfunded' | 'rpc_unavailable';

interface Caller {
  iteraUserId: string;
  wallet: string | null;
}

async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

/** The itera user and wallet come from the verified token, never from the request body. */
async function resolveCaller(db: IteraClient, request: Request): Promise<Caller | Response> {
  const cors = corsHeaders(request, 'app');
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) return json({ error: 'unauthorized' }, 401, cors);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return json({ error: 'unauthorized' }, 401, cors);

  const { data: identity, error: identityError } = await db
    .from('identities')
    .select('user_id')
    .eq('provider_subject', data.user.id)
    .limit(1)
    .maybeSingle();
  if (identityError) throw new Error(`identities: ${identityError.message}`);
  if (!identity) return json({ error: 'no_itera_profile' }, 403, cors);

  // identity_data is written by the auth server at sign-in; user_metadata is editable by the user.
  const { wallet } = await resolveWallet(db, identity.user_id, data.user.identities);
  return { iteraUserId: identity.user_id, wallet };
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/**
 * Operator call: the bearer is the service-role key itself. Compared in constant
 * time, and refused when a browser sent it (an `Origin` header is present).
 */
async function isOperator(request: Request): Promise<boolean> {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token = bearerToken(request);
  if (!key || !token || request.headers.has('origin')) return false;
  const [given, expected] = await Promise.all([sha256(token), sha256(key)]);
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= given[index] ^ expected[index];
  return difference === 0;
}

/** The learner an operator named, with that learner's own wallet: the web3 identity, else the linked one. */
async function resolveNamedUser(db: IteraClient, iteraUserId: string): Promise<Caller | null> {
  const { data, error } = await db.from('identities').select('provider_subject').eq('user_id', iteraUserId);
  if (error) throw new Error(`identities: ${error.message}`);
  if (!data || data.length === 0) return null;
  for (const { provider_subject: subject } of data) {
    if (!isUuid(subject)) continue;
    const { data: account } = await db.auth.admin.getUserById(subject);
    const wallet = walletOf(account?.user?.identities);
    if (wallet) return { iteraUserId, wallet };
  }
  return { iteraUserId, wallet: (await linkedWalletOf(db, iteraUserId))?.wallet ?? null };
}

/** The learner's rows. A passport wears what was paid for, whatever its stored state says. */
async function loadRows(db: IteraClient, userId: string): Promise<AchievementRow[]> {
  const rows = await fetchAll<AchievementRow>((from, to) =>
    db.from('user_achievements').select(ROW_COLUMNS).eq('user_id', userId).order('earned_at').order('id').range(from, to),
  );
  return restoreCosmetics(db, rows);
}

async function loadCatalog(db: IteraClient): Promise<Map<string, CatalogEntry>> {
  const { data, error } = await db.from('achievements').select(CATALOG_COLUMNS);
  if (error) throw new Error(`achievements: ${error.message}`);
  return new Map((data as CatalogEntry[]).map((entry) => [entry.key, entry]));
}

/** Everything `computeAwards` reads, fetched in one round of parallel queries. */
async function loadProgressAndTree(db: IteraClient, userId: string): Promise<Omit<AwardsInput, 'existing'>> {
  const [progress, passed, programs, units, lessons, activities] = await Promise.all([
    fetchAll<AwardsInput['progress'][number]>((from, to) =>
      db.from('progress').select('activity_id,status,completed_at,written_by_client').eq('user_id', userId).eq('status', 'completed').order('activity_id').range(from, to),
    ),
    // The plausibility floor reads which activities have a passed attempt.
    fetchAll<{ activity_id: string }>((from, to) =>
      db.from('activity_results').select('activity_id').eq('user_id', userId).eq('passed', true).order('activity_id').order('id').range(from, to),
    ),
    fetchAll<{ id: string; slug: string; title_i18n: Record<string, string> }>((from, to) =>
      db.from('programs').select('id,slug,title_i18n').is('archived_at', null).order('id').range(from, to),
    ),
    fetchAll<{ id: string; program_id: string; ordinal: number; title_i18n: Record<string, string> }>((from, to) =>
      db.from('units').select('id,program_id,ordinal,title_i18n').order('id').range(from, to),
    ),
    fetchAll<{ id: string; unit_id: string; ordinal: number; title_i18n: Record<string, string> }>((from, to) =>
      db.from('lessons').select('id,unit_id,ordinal,title_i18n').order('id').range(from, to),
    ),
    fetchAll<{ id: string; lesson_id: string }>((from, to) =>
      db.from('activities').select('id,lesson_id').eq('status', 'published').order('id').range(from, to),
    ),
  ]);

  return {
    programs: programs.map((program) => ({ id: program.id, slug: program.slug, title: program.title_i18n })),
    units: units.map((unit) => ({ id: unit.id, program_id: unit.program_id, ordinal: unit.ordinal, title: unit.title_i18n })),
    lessons: lessons.map((lesson) => ({ id: lesson.id, unit_id: lesson.unit_id, ordinal: lesson.ordinal, title: lesson.title_i18n })),
    activities,
    progress,
    passedActivityIds: new Set(passed.map((row) => row.activity_id)),
    timeZone: TIME_ZONE,
  };
}

/** Writes what `computeAwards` found. Returns the ids this call created and the ones it moved. */
async function storeAwards(db: IteraClient, userId: string, awards: Award[], existing: AchievementRow[]) {
  const created = new Set<string>();
  const changed = new Set<string>();
  const insert = async (rows: Array<Record<string, unknown>>) => {
    if (rows.length === 0) return [];
    const { data, error } = await db
      .from('user_achievements')
      .upsert(rows, { onConflict: ROW_KEY, ignoreDuplicates: true })
      .select('id,achievement_key,ref_id');
    if (error) throw new Error(`user_achievements insert: ${error.message}`);
    for (const row of data ?? []) created.add(row.id);
    return data ?? [];
  };
  const toRow = (award: Award, extraState: Record<string, unknown> = {}) => ({
    user_id: userId,
    achievement_key: award.key,
    ref_id: award.ref_id,
    earned_at: award.earned_at,
    state: { ...award.state, ...extraState },
  });

  if (awards.length === 0) return { created, changed };

  const inserts = awards.filter((award) => award.op === 'insert');
  await insert(inserts.filter((award) => award.key === 'trail_pass').map((award) => toRow(award)));

  for (const award of awards.filter((entry) => entry.op === 'update')) {
    const stored = existing.find((row) => row.achievement_key === award.key && row.ref_id === award.ref_id);
    if (!stored) continue;
    const { error } = await db
      .from('user_achievements')
      .update({ state: { ...stored.state, ...award.state } })
      .eq('id', stored.id)
      .eq('user_id', userId);
    if (error) throw new Error(`user_achievements update: ${error.message}`);
    changed.add(stored.id);
  }

  const { data: passports, error } = await db
    .from('user_achievements')
    .select('id,ref_id')
    .eq('user_id', userId)
    .eq('achievement_key', 'trail_pass');
  if (error) throw new Error(`user_achievements passports: ${error.message}`);
  const passportByUnit = new Map((passports ?? []).map((row) => [row.ref_id, row.id]));

  await insert(
    inserts
      .filter((award) => award.key !== 'trail_pass')
      .map((award) => {
        const unitId = award.state.unit_id;
        return toRow(award, typeof unitId === 'string' ? { parent_id: passportByUnit.get(unitId) ?? null } : {});
      }),
  );
  return { created, changed };
}

/** Takes the rows of a job for this invocation. All or nothing: a partial claim is released. */
async function claim(db: IteraClient, job: MintJob, wallet: string): Promise<boolean> {
  const ids = job.rows.map((row) => row.id);
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { data, error } = await db
    .from('user_achievements')
    .update({ mint_status: 'pending', mint_claimed_at: new Date().toISOString(), wallet_address: wallet })
    .in('id', ids)
    .or(`mint_status.in.(unclaimed,failed),and(mint_status.eq.pending,mint_claimed_at.lt."${staleBefore}")`)
    .select('id');
  if (error) throw new Error(`claim: ${error.message}`);
  const claimed = (data ?? []).map((row) => row.id);
  if (claimed.length === ids.length) return true;
  if (claimed.length > 0) {
    await db.from('user_achievements').update({ mint_status: 'unclaimed', mint_claimed_at: null }).in('id', claimed);
  }
  return false;
}

async function settle(db: IteraClient, job: MintJob, patch: (row: AchievementRow) => Record<string, unknown>) {
  for (const row of job.rows) {
    const { error } = await db.from('user_achievements').update(patch(row)).eq('id', row.id);
    if (error) throw new Error(`settle: ${error.message}`);
  }
}

async function collectionAddress(db: IteraClient, sdk: ChainSdk, chain: Chain, kind: CollectionKind, known: Record<string, string>): Promise<string> {
  const { configKey } = COLLECTIONS[kind];
  if (known[configKey]) return known[configKey];
  const address = await sdk.ensureCollection(chain, kind, `${functionsBase()}/credential-meta/collection/${kind}`);
  const now = new Date().toISOString();
  const { error } = await db.from('onchain_config').upsert([
    { key: configKey, value: address, updated_at: now },
    { key: 'authority', value: chain.authority, updated_at: now },
    { key: 'cluster', value: CLUSTER, updated_at: now },
  ]);
  if (error) throw new Error(`onchain_config: ${error.message}`);
  known[configKey] = address;
  return address;
}

async function runJob(
  db: IteraClient,
  sdk: ChainSdk,
  chain: Chain,
  job: MintJob,
  wallet: string,
  catalog: Map<string, CatalogEntry>,
  config: Record<string, string>,
): Promise<void> {
  const anchorCatalog = catalog.get(job.anchor.achievement_key) as CatalogEntry;
  const kind: CollectionKind = job.type === 'create_medal' ? 'medals' : 'passports';
  const collection = await collectionAddress(db, sdk, chain, kind, config);
  // Read again right before the write: a cosmetic bought while this call ran must not be wiped by the stamp.
  const [anchor] = await restoreCosmetics(db, [job.anchor]);
  const attributes = onchainAttributes(anchor, anchorCatalog);

  let asset = job.anchor.asset_address;
  let signature: string | null;
  if (job.type === 'update_passport') {
    signature = await sdk.updateCredentialAttributes(chain, { asset: asset as string, collection, attributes });
  } else {
    const created = await sdk.createCredential(chain, {
      rowId: job.anchor.id,
      collection,
      owner: wallet,
      name: assetName(job.anchor, anchorCatalog),
      uri: metadataUrl(functionsBase(), job.anchor.id),
      attributes,
    });
    asset = created.asset;
    signature = created.signature;
    // An asset left by an interrupted call may predate the stamps it should carry now.
    if (created.alreadyExisted && job.type === 'create_passport') {
      signature = await sdk.updateCredentialAttributes(chain, { asset, collection, attributes });
    }
  }

  const mintedAt = new Date().toISOString();
  await settle(db, job, (row) => {
    const { mint_error: _cleared, ...state } = row.id === anchor.id ? anchor.state : row.state;
    return {
      mint_status: 'minted',
      asset_address: asset,
      tx_signature: signature,
      minted_at: mintedAt,
      wallet_address: job.anchor.wallet_address ?? wallet,
      state: row.id === job.anchor.id ? state : { ...state, parent_id: job.anchor.id, tx: signature },
    };
  });
}

async function mintPending(
  db: IteraClient,
  caller: Caller,
  rows: AchievementRow[],
  catalog: Map<string, CatalogEntry>,
  maxJobs: number,
): Promise<{ attempted: number; remaining: number; blocked: MintBlock | null; touched: Set<string> }> {
  const medalKeys = new Set([...catalog.values()].filter((entry) => entry.kind === 'streak' || entry.kind === 'milestone').map((entry) => entry.key));
  const jobs = planMintJobs(rows, medalKeys);
  const touched = new Set<string>();
  const outcome = (attempted: number, done: number, blocked: MintBlock | null) => ({
    attempted,
    remaining: jobs.length - done,
    blocked,
    touched,
  });
  if (jobs.length === 0) return outcome(0, 0, null);
  if (!caller.wallet) return outcome(0, 0, 'no_wallet');

  // Loaded on demand: most calls have nothing to mint and should not pay for the Solana SDK.
  const sdk = await import('../_shared/chain.ts');
  let chain: Chain;
  try {
    chain = sdk.loadChain();
  } catch (error) {
    if (error instanceof sdk.ChainNotConfiguredError) return outcome(0, 0, 'authority_not_configured');
    throw error;
  }
  try {
    if ((await sdk.authorityLamports(chain)) < sdk.MIN_AUTHORITY_LAMPORTS) return outcome(0, 0, 'authority_unfunded');
  } catch (error) {
    console.error('balance check failed', error);
    return outcome(0, 0, 'rpc_unavailable');
  }

  const config = await loadConfig(db);

  const startedAt = Date.now();
  let attempted = 0;
  let done = 0;
  for (const job of jobs) {
    if (attempted >= maxJobs || Date.now() - startedAt > MINT_BUDGET_MS) break;
    if (!(await claim(db, job, caller.wallet))) continue;
    attempted += 1;
    for (const row of job.rows) touched.add(row.id);
    try {
      await runJob(db, sdk, chain, job, caller.wallet, catalog, config);
      done += 1;
    } catch (error) {
      console.error(`mint job ${job.type} for ${job.anchor.id} failed`, error);
      const message = String(error instanceof Error ? error.message : error).slice(0, 300);
      await settle(db, job, (row) => ({ mint_status: 'failed', state: { ...row.state, mint_error: message } }));
    }
  }
  return outcome(attempted, done, null);
}

/**
 * The inviter's half of an invite reward, off the response path of the invited
 * learner's call: the new medal is minted to the inviter's wallet when there is
 * one, and the life reaches the companion asset.
 */
async function settleInviter(db: IteraClient, inviterId: string, catalog: Map<string, CatalogEntry>): Promise<void> {
  const inviter = await resolveNamedUser(db, inviterId);
  if (!inviter?.wallet) return;
  // The public devnet node throttles bursts: a failed mint is tried again here instead of waiting for the inviter's next visit.
  for (let attempt = 0; attempt < INVITER_MINT_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, INVITER_MINT_PAUSE_MS));
    const outcome = await mintPending(db, inviter, await loadRows(db, inviterId), catalog, MAX_JOBS_PER_CALL);
    if (outcome.remaining === 0) break;
  }
  await syncMirror(db, inviterId);
}

function view(row: AchievementRow, catalog: Map<string, CatalogEntry>, lang: Lang) {
  const entry = catalog.get(row.achievement_key) as CatalogEntry;
  const base = functionsBase();
  return {
    id: row.id,
    key: row.achievement_key,
    kind: entry.kind,
    tier: tierOf(row, entry),
    title: pickText(entry.title_i18n, lang),
    description: pickText(entry.description_i18n, lang),
    ref_id: row.ref_id,
    state: 'trail_title' in row.state ? { ...row.state, trail: pickText(row.state.trail_title, lang) } : row.state,
    earned_at: row.earned_at,
    mint_status: row.mint_status,
    asset_address: row.asset_address,
    tx_signature: row.tx_signature,
    explorer_url: explorerUrl('address', row.asset_address),
    tx_explorer_url: explorerUrl('tx', row.tx_signature),
    metadata_url: metadataUrl(base, row.id),
    image_url: imageUrl(base, row.id),
  };
}

interface Body {
  lang: Lang;
  /** Operator calls only: the learner to sync and how many transactions to send. */
  userId: string | null;
  maxJobs: number | null;
  /** Optional: report whether this lesson is fully completed (`day_incomplete`). */
  lessonId: string | null;
}

async function readBody(request: Request): Promise<Body | null> {
  const text = await request.text();
  if (text.length > 1024) return null;
  if (!text.trim()) return { lang: 'pt', userId: null, maxJobs: null, lessonId: null };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { lang = 'pt', user_id: userId = null, max_jobs: maxJobs = null, lesson_id: lessonId = null } = body as Record<string, unknown>;
  if (lang !== 'pt' && lang !== 'en') return null;
  return {
    lang,
    userId: typeof userId === 'string' ? userId : null,
    maxJobs: typeof maxJobs === 'number' ? maxJobs : null,
    lessonId: typeof lessonId === 'string' && isUuid(lessonId) ? lessonId : null,
  };
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const body = await readBody(request);
    if (!body) return json({ error: 'invalid_body' }, 400, cors);
    const { lang } = body;

    const db = serviceClient();
    let caller: Caller | Response;
    let maxJobs = MAX_JOBS_PER_CALL;
    if (body.userId !== null && (await isOperator(request))) {
      const jobs = body.maxJobs ?? MAX_JOBS_PER_CALL;
      if (!isUuid(body.userId) || !Number.isInteger(jobs) || jobs < 1 || jobs > MAX_OPERATOR_JOBS) {
        return json({ error: 'invalid_body' }, 400, cors);
      }
      const named = await resolveNamedUser(db, body.userId);
      if (!named) return json({ error: 'no_itera_profile' }, 403, cors);
      caller = named;
      maxJobs = jobs;
    } else {
      caller = await resolveCaller(db, request);
    }
    if (caller instanceof Response) return caller;

    const [before, catalog, learning] = await Promise.all([
      loadRows(db, caller.iteraUserId),
      loadCatalog(db),
      loadProgressAndTree(db, caller.iteraUserId),
    ]);
    const existing = before.map((row) => ({ achievement_key: row.achievement_key, ref_id: row.ref_id, state: row.state }));
    const awards = computeAwards({ ...learning, existing });
    // A completed day that fails the plausibility floor awards nothing; the answer says so in neutral terms.
    const pendingReview = dayPendingReview({ ...learning, existing }, body.lessonId);
    const stored = await storeAwards(db, caller.iteraUserId, awards, before);
    let rows = awards.length > 0 ? await loadRows(db, caller.iteraUserId) : before;

    // The invite reward is paid on the invited learner's first completed day, and only then.
    let inviterToSettle: string | null = null;
    let referral: ReturnType<typeof referralNote> = null;
    if (rows.some((row) => row.achievement_key === 'first_stamp')) {
      const reward = await rewardReferral(db, caller.iteraUserId);
      referral = referralNote(reward);
      if (reward?.rewarded) {
        for (const id of reward.createdRowIds) stored.created.add(id);
        rows = await loadRows(db, caller.iteraUserId);
        inviterToSettle = reward.inviterUserId;
        if (caller.wallet) inBackground(syncMirror(db, caller.iteraUserId));
      }
    }

    const mint = await mintPending(db, caller, rows, catalog, maxJobs);
    // After this learner's own mints, so the two do not compete for the node.
    if (inviterToSettle) inBackground(settleInviter(db, inviterToSettle, catalog));
    if (mint.touched.size > 0) rows = await loadRows(db, caller.iteraUserId);

    const updatedIds = new Set([...stored.changed, ...mint.touched].filter((id) => !stored.created.has(id)));
    return json(
      {
        awards: rows.filter((row) => stored.created.has(row.id)).map((row) => view(row, catalog, lang)),
        updated: rows.filter((row) => updatedIds.has(row.id)).map((row) => view(row, catalog, lang)),
        remaining: mint.remaining,
        mint: { wallet: caller.wallet, cluster: CLUSTER, attempted: mint.attempted, blocked: mint.blocked },
        ...(body.lessonId ? { day_incomplete: dayIncomplete(learning, body.lessonId) } : {}),
        ...(pendingReview ? { day_pending_review: pendingReview } : {}),
        ...(referral ? { referral } : {}),
      },
      200,
      cors,
    );
  } catch (error) {
    console.error('passport failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
