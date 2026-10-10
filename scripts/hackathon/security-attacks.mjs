#!/usr/bin/env node
// Reproduces the attacks of the security review against the LIVE hackathon functions (Solana devnet)
// and proves each one is refused. One section per finding; run all or name the ones you want:
//
//   node scripts/hackathon/security-attacks.mjs            # every section
//   node scripts/hackathon/security-attacks.mjs a c        # only "pay once, get two" and progress
//
// Environment (source ~/.config/itera-hackathon/supabase.env): HACKATHON_DB_PASSWORD,
// SUPABASE_ACCESS_TOKEN (or HACKATHON_ANON_KEY). Paying wallets are throwaway keypairs funded from
// the TREASURY key (HACKATHON_TREASURY_KEYFILE, default ~/.config/itera-hackathon/devnet-treasury.json):
// what they pay goes back to the treasury, so a run costs network fees only. Sections say what
// they spend. The script stops before a section when the mint authority would go below 0.62 SOL or
// the treasury below 0.25 SOL. Leaves throwaway wallet users behind; never touches the owner's
// wallet account or the demo e-mail user.
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { compactU16, base58Decode, base58Encode, buildTransferMessage, transferData, MEMO_PROGRAM, SYSTEM_PROGRAM } from '../../supabase/functions/_shared/solana-tx.ts';
import { FUNCTIONS, PROTECTED_WALLET, SUPABASE_URL, anonKey, balance, check, newLearner, psql, rpc, signAndSend, sleep, sol, summary, until } from './social-e2e.lib.mjs';

const AUTHORITY = 'CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B';
const AUTHORITY_FLOOR = 620_000_000n;
const TREASURY_FLOOR = 250_000_000n;
/** What a section may spend at most, so the floors are checked before it starts. */
const MARGIN = 10_000_000n;
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

function loadTreasury() {
  const file = process.env.HACKATHON_TREASURY_KEYFILE ?? `${homedir()}/.config/itera-hackathon/devnet-treasury.json`;
  const secret = Uint8Array.from(JSON.parse(readFileSync(file, 'utf8')));
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(secret.slice(0, 32))]), format: 'der', type: 'pkcs8' });
  return { privateKey, address: base58Encode(secret.slice(32)) };
}

const SIWS_HOST = 'hackathon.iterahq.dev';
const KEY_DIR = process.env.SECURITY_ATTACKS_KEY_DIR ?? '/tmp/itera-security-attacks-keys';

/**
 * A wallet learner whose throwaway key is kept in `KEY_DIR`, so a section that had to mint (the
 * companion of section D) can be run again without paying for a second mint. Same shape as `newLearner`.
 */
async function keptLearner(apikey, label, name) {
  mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  const file = `${KEY_DIR}/${name}.json`;
  let privateKey;
  if (existsSync(file)) {
    privateKey = createPrivateKey({ key: Buffer.from(JSON.parse(readFileSync(file, 'utf8')).pkcs8, 'base64'), format: 'der', type: 'pkcs8' });
  } else {
    ({ privateKey } = generateKeyPairSync('ed25519'));
    writeFileSync(file, JSON.stringify({ pkcs8: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64') }), { mode: 0o600 });
  }
  const address = base58Encode(createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).subarray(-32));
  if (address === PROTECTED_WALLET) throw new Error('refusing the protected wallet');
  const message = [`${SIWS_HOST} wants you to sign in with your Solana account:`, address, '', 'Sign in to Itera Hackathon', '', `URI: https://${SIWS_HOST}/login`, 'Version: 1', `Issued At: ${new Date().toISOString()}`].join('\n');
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=web3`, { method: 'POST', headers: { apikey, 'Content-Type': 'application/json' }, body: JSON.stringify({ chain: 'solana', message, signature: sign(null, Buffer.from(message), privateKey).toString('base64url') }) });
  const session = await response.json();
  if (!response.ok || !session.access_token) throw new Error(`sign-in failed: HTTP ${response.status} ${JSON.stringify(session).slice(0, 200)}`);
  const userId = psql(`select user_id from itera.identities where provider_subject = :'subject' limit 1;`, { subject: session.user.id });
  const headers = { apikey, 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` };
  const call = async (functionName, body = {}) => {
    const answer = await fetch(`${FUNCTIONS}/${functionName}`, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: answer.status, body: await answer.json() };
  };
  console.log(`${label}: wallet ${address} · itera user ${userId} (key kept in ${file})`);
  return { privateKey, address, userId, call, headers, label, authUserId: session.user.id };
}

/** Sends back to the treasury what a throwaway wallet has left (all of it but the fee). */
async function sweepToTreasury(context, wallet) {
  const left = await balance(wallet.address);
  if (left <= 5_000n) return;
  await signAndSend(wallet, buildTransferMessage({ payer: wallet.address, recipient: context.treasury.address, lamports: left - 5_000n, memo: 'security-attacks: sweep', recentBlockhash: await latestBlockhash() }));
}

const latestBlockhash = async () => (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value.blockhash;

async function fundFromTreasury(context, recipient, lamports) {
  return signAndSend(context.treasury, buildTransferMessage({ payer: context.treasury.address, recipient, lamports, memo: 'security-attacks: funding', recentBlockhash: await latestBlockhash() }));
}

async function balances(context, label) {
  const now = { authority: await balance(AUTHORITY), treasury: await balance(context.treasury.address) };
  console.log(`[balances ${label}] authority ${sol(now.authority)} SOL · treasury ${sol(now.treasury)} SOL`);
  return now;
}

async function guard(context, label) {
  const now = await balances(context, `before ${label}`);
  if (now.authority - MARGIN < AUTHORITY_FLOOR) throw new Error(`STOP: the mint authority (${sol(now.authority)} SOL) is too close to its 0.62 SOL floor`);
  if (now.treasury - MARGIN < TREASURY_FLOOR) throw new Error(`STOP: the treasury (${sol(now.treasury)} SOL) is too close to its 0.25 SOL floor`);
}

const key = (address) => [...base58Decode(address, 32)];

/** One System transfer payer -> recipient followed by ONE memo instruction PER entry of `memos`. */
function buildMultiMemoMessage({ payer, recipient, lamports, memos, recentBlockhash }) {
  const transfer = transferData(lamports);
  const memoInstructions = memos.flatMap((text) => {
    const bytes = new TextEncoder().encode(text);
    return [3, ...compactU16(0), ...compactU16(bytes.length), ...bytes];
  });
  return Uint8Array.from([
    1, 0, 2,
    ...compactU16(4),
    ...key(payer), ...key(recipient), ...key(SYSTEM_PROGRAM), ...key(MEMO_PROGRAM),
    ...key(recentBlockhash),
    ...compactU16(1 + memos.length),
    2, ...compactU16(2), 0, 1, ...compactU16(transfer.length), ...transfer,
    ...memoInstructions,
  ]);
}

async function action(url, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

const purchaseRow = (id) => psql(`select status || '|' || coalesce(tx_signature, '') from itera.purchases where id = :'id'::uuid;`, { id }).split('|');
const giftRow = (id) => psql(`select status || '|' || coalesce(tx_signature, '') from itera.gifts where id = :'id'::uuid;`, { id }).split('|');
const ledgerRef = (signature) => psql(`select coalesce((select kind || ':' || ref_id from itera.payments where tx_signature = :'signature'), '');`, { signature });
const livesOf = (userId) => psql(`select coalesce((select lives::text from itera.companions where user_id = :'user_id'::uuid), '');`, { user_id: userId });

// --- A. Finding 2: pay once, get two --------------------------------------------------------------
// Spends: two network fees of a throwaway wallet + one funding fee of the treasury. No mint.
async function payOnceGetTwo(context) {
  const { apikey, treasury } = context;
  const PRICE = 1_100_000n;
  const attacker = await newLearner(apikey, 'A attacker');
  const victim = await newLearner(apikey, 'A recipient of the gift');
  await fundFromTreasury(context, attacker.address, 2n * (PRICE + 5_000n));

  const intent = await attacker.call('purchase-intent', { item_key: 'outfit_glasses' });
  const otherIntent = await attacker.call('purchase-intent', { item_key: 'outfit_headphones' });
  const post =await action(`${FUNCTIONS}/action-gift?to=${victim.address}`, { account: attacker.address });
  const giftId = post.status === 200 ? new URL(post.body.links.next.href).searchParams.get('gift') : null;
  const purchaseId = intent.body.intent_id;
  check('A setup: a purchase intent and an Action gift are open for the same paying wallet', intent.status === 200 && post.status === 200 && Boolean(giftId) && giftId !== purchaseId, `${intent.status} ${post.status}`);
  const livesBefore = livesOf(victim.userId);

  // The attack of the review: ONE transfer of the higher price, the memos of BOTH intents.
  const attack = buildMultiMemoMessage({ payer: attacker.address, recipient: treasury.address, lamports: PRICE, memos: [purchaseId, giftId], recentBlockhash: await latestBlockhash() });
  const wire = Buffer.from([1, ...sign(null, Buffer.from(attack), attacker.privateKey), ...attack]);
  const submitted = await attacker.call('purchase-submit', { intent_id: purchaseId, signed_transaction: wire.toString('base64') });
  check('A purchase-submit: the two-memo transaction is refused BEFORE it is broadcast (422 payment_mismatch memo)', submitted.status === 422 && submitted.body.error === 'payment_mismatch' && submitted.body.detail === 'memo', JSON.stringify(submitted.body));

  const attackSignature = await signAndSend(attacker, attack);
  console.log(`A two-memo transaction on chain: ${attackSignature}`);
  const confirmPurchase = await until(() => attacker.call('purchase-confirm', { intent_id: purchaseId, signature: attackSignature }), (answer) => answer.body.error !== 'tx_not_found', 6, 1500);
  check('A purchase-confirm with the two-memo payment: refused (422 payment_mismatch memo)', confirmPurchase.status === 422 && confirmPurchase.body.detail === 'memo', JSON.stringify(confirmPurchase.body));
  const confirmGift = await until(() => action(post.body.links.next.href, { account: attacker.address, signature: attackSignature }), (answer) => answer.status !== 404, 6, 1500);
  check('A action-gift/confirm with the SAME signature: refused (422), no life given', confirmGift.status === 422 && typeof confirmGift.body.message === 'string', `${confirmGift.status} ${JSON.stringify(confirmGift.body)}`);
  // The reconcile finds the gift id among the payer's memos and tries the same settlement.
  await action(`${FUNCTIONS}/action-gift?to=${victim.address}`, { account: attacker.address });
  check('A after confirm, callback and reconcile: purchase pending, gift pending, no ledger entry, recipient unchanged', purchaseRow(purchaseId)[0] === 'pending' && giftRow(giftId)[0] === 'pending' && ledgerRef(attackSignature) === '' && livesOf(victim.userId) === livesBefore, `${purchaseRow(purchaseId)[0]} ${giftRow(giftId)[0]} ledger="${ledgerRef(attackSignature)}"`);

  // An honest payment of the purchase, then the same signature offered to the gift.
  const again = await attacker.call('purchase-intent', { item_key: 'outfit_glasses' });
  const honest = await signAndSend(attacker, Buffer.from(again.body.message_base64, 'base64'));
  const startedAt = Date.now();
  const paid = await until(() => attacker.call('purchase-confirm', { intent_id: again.body.intent_id, signature: honest }), (answer) => answer.body.error !== 'tx_not_found', 6, 1500);
  check('A an honest one-memo payment still settles the purchase', again.body.intent_id === purchaseId && paid.status === 200 && paid.body.status === 'paid' && ledgerRef(honest) === `purchase:${purchaseId}`, `${paid.status} ${JSON.stringify(paid.body).slice(0, 120)} ledger=${ledgerRef(honest)}`);
  console.log(`A purchase-confirm answered in ${Date.now() - startedAt} ms · circuit ${JSON.stringify(paid.body.circuit ?? null)}`);
  const reuse = await action(post.body.links.next.href, { account: attacker.address, signature: honest });
  check('A the paid signature offered to the gift: 409 signature reused', reuse.status === 409, `${reuse.status} ${JSON.stringify(reuse.body)}`);
  const ledger = psql(`select itera.settle_payment('gift', :'gift'::uuid, :'signature', 550000);`, { gift: giftId, signature: honest });
  check('A the ledger itself (verification skipped on purpose): signature_reused, gift still pending', ledger === 'signature_reused' && giftRow(giftId)[0] === 'pending' && livesOf(victim.userId) === livesBefore, ledger);
  const crossPurchase = await attacker.call('purchase-confirm', { intent_id: otherIntent.body.intent_id, signature: honest });
  check('A the paid signature offered to a second purchase: 409 signature_reused', otherIntent.status === 200 && crossPurchase.status === 409 && crossPurchase.body.error === 'signature_reused' && purchaseRow(otherIntent.body.intent_id)[0] === 'pending', `${crossPurchase.status} ${JSON.stringify(crossPurchase.body)}`);
}

/** A learner's own PostgREST call (anon key + own JWT), exactly what any signed-in browser can send. */
async function restAs(learner, method, path, body, prefer) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...learner.headers, 'Content-Profile': 'itera', 'Accept-Profile': 'itera', ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

/** The published activities of a day of the demo trail, in order: `[{ id, kind }]`. */
function lessonActivities(day = 1) {
  const lesson = psql(
    `select l.id from itera.programs p join itera.units u on u.program_id = p.id join itera.lessons l on l.unit_id = u.id
     where p.slug = 'itera-v2' and exists (select 1 from itera.activities a where a.lesson_id = l.id and a.status = 'published')
     order by u.ordinal, l.ordinal, l.id offset :skip limit 1;`,
    { skip: day - 1 },
  );
  const rows = psql(`select id || '|' || kind::text from itera.activities where lesson_id = :'lesson'::uuid and status = 'published' order by ordinal, id;`, { lesson });
  return { lesson, activities: rows.split('\n').filter(Boolean).map((row) => ({ id: row.split('|')[0], kind: row.split('|')[1] })) };
}

const xpOf = (userId) => psql(`select count(*) || '|' || coalesce(sum(amount), 0) from itera.xp_events where user_id = :'user_id'::uuid;`, { user_id: userId });

// --- B. Finding 3: forgeable XP -------------------------------------------------------------------
// Spends nothing on chain.
async function forgeXp(context) {
  const learner = await newLearner(context.apikey, 'B learner');
  const { activities } = lessonActivities(1);
  const [first, second] = activities;
  const award = (activityId, amount) => restAs(learner, 'POST', 'rpc/award_activity_xp', { p_activity_id: activityId, p_amount: amount });

  const cold = await award(first.id, 2_000_000_000);
  check('B xp for an activity the learner never completed: nothing', cold.status === 200 && cold.body === 0 && xpOf(learner.userId) === '0|0', `${cold.status} ${JSON.stringify(cold.body)} ${xpOf(learner.userId)}`);

  const done = await restAs(learner, 'POST', 'progress?on_conflict=user_id,activity_id', { user_id: learner.userId, activity_id: first.id, status: 'completed', completed_at: new Date().toISOString() }, 'resolution=merge-duplicates');
  const forged = await award(first.id, 2_000_000_000);
  check('B p_amount 2 000 000 000 for a completed activity: the normal 10 xp', done.status < 300 && forged.status === 200 && forged.body === 10 && xpOf(learner.userId) === '1|10', `${done.status} ${forged.status} ${JSON.stringify(forged.body)} ${xpOf(learner.userId)}`);
  const again = await award(first.id, 2_000_000_000);
  check('B the same activity again: nothing, still one event', again.body === 0 && xpOf(learner.userId) === '1|10', `${JSON.stringify(again.body)} ${xpOf(learner.userId)}`);
  const negative = await award(second.id, -5);
  check('B a negative amount, and an activity of the lesson not completed: nothing', negative.body === 0 && xpOf(learner.userId) === '1|10', JSON.stringify(negative.body));
  const anonymous = await fetch(`${SUPABASE_URL}/rest/v1/rpc/award_activity_xp`, { method: 'POST', headers: { apikey: context.apikey, 'Content-Type': 'application/json', 'Content-Profile': 'itera' }, body: JSON.stringify({ p_activity_id: first.id, p_amount: 10 }) });
  check('B without a session: refused', anonymous.status === 401 || anonymous.status === 403 || anonymous.status === 404, anonymous.status);
  const direct = await restAs(learner, 'POST', 'xp_events', { user_id: learner.userId, tenant_id: '00000000-0000-0000-0000-000000000000', amount: 2_000_000_000, reason: 'forged' });
  check('B writing xp_events directly: refused', direct.status >= 400 && xpOf(learner.userId) === '1|10', direct.status);
}

const progressRow = (userId, activityId) =>
  psql(`select status::text || '|' || coalesce(to_char(completed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '') || '|' || written_by_client from itera.progress where user_id = :'user_id'::uuid and activity_id = :'activity'::uuid;`, { user_id: userId, activity: activityId }).split('|');
const achievementCount = (userId) => Number(psql(`select count(*) from itera.user_achievements where user_id = :'user_id'::uuid;`, { user_id: userId }));
const isRecent = (iso) => Math.abs(Date.now() - new Date(iso).getTime()) < 120_000;
const upsertProgress = (learner, rows) => restAs(learner, 'POST', 'progress?on_conflict=user_id,activity_id', rows, 'resolution=merge-duplicates');

// --- C. Finding 1: client-written progress (mitigations only) -------------------------------------
// Spends: the two mints of ONE honest first day (certification + first medal), about 0.007 SOL of
// the authority. The fabricated day mints nothing.
async function fakeProgress(context) {
  const { lesson, activities } = lessonActivities(1);
  const faker = await newLearner(context.apikey, 'C fabricates a day');
  const honest = await newLearner(context.apikey, 'C plays a day');
  context.honestLearner = honest;
  const last = activities.at(-1);

  // 1. The attack of the review: every activity of a day "completed" in one request, with invented dates.
  const invented = activities.map((activity, index) => ({ user_id: faker.userId, activity_id: activity.id, status: 'completed', completed_at: new Date(Date.parse('2026-09-20T08:00:00Z') + index * 240_000).toISOString() }));
  const bulk = await upsertProgress(faker, invented);
  const [status, completedAt, byClient] = progressRow(faker.userId, last.id);
  check('C a completion written by the client carries the SERVER time, not the date it sent', bulk.status < 300 && status === 'completed' && isRecent(completedAt) && byClient === 'true', `${bulk.status} ${completedAt} client=${byClient}`);
  const rewrite = await restAs(faker, 'PATCH', `progress?user_id=eq.${faker.userId}&activity_id=eq.${last.id}`, { completed_at: '2026-09-20T05:00:00Z', written_by_client: false });
  const afterRewrite = progressRow(faker.userId, last.id);
  check('C changing completed_at (or the origin flag) of a completed row afterwards: ignored', rewrite.status < 300 && afterRewrite[1] === completedAt && afterRewrite[2] === 'true', afterRewrite.join(' '));

  const fabricated = await faker.call('passport', { lang: 'en', lesson_id: lesson });
  check('C passport for the fabricated day: no award, no mint, neutral `day_pending_review` (too_fast)', fabricated.status === 200 && fabricated.body.awards.length === 0 && fabricated.body.mint.attempted === 0 && fabricated.body.day_pending_review?.lesson_id === lesson && fabricated.body.day_pending_review.reason === 'too_fast' && fabricated.body.day_incomplete === null && achievementCount(faker.userId) === 0, JSON.stringify(fabricated.body).slice(0, 200));
  const fabricatedAt = Date.now();

  // 2. What the app itself does must keep working: reopen (live-class reset) and operator backdating.
  const reopened = await restAs(faker, 'PATCH', `progress?user_id=eq.${faker.userId}&activity_id=eq.${activities[0].id}`, { status: 'in_progress', completed_at: null });
  check('C the app\'s reopen (completed -> in_progress) still works', reopened.status < 300 && progressRow(faker.userId, activities[0].id).slice(0, 2).join('|') === 'in_progress|', progressRow(faker.userId, activities[0].id).join(' '));
  await upsertProgress(faker, [{ user_id: faker.userId, activity_id: activities[0].id, status: 'completed', completed_at: '2026-09-20T05:00:00Z' }]);
  check('C completing it again: server time again', isRecent(progressRow(faker.userId, activities[0].id)[1]));
  psql(`update itera.progress set completed_at = '2026-09-20T05:00:00Z' where user_id = :'user_id'::uuid and activity_id = :'activity'::uuid;`, { user_id: faker.userId, activity: activities[1].id });
  check('C an operator (psql / service role) can still backdate a row', progressRow(faker.userId, activities[1].id)[1] === '2026-09-20T05:00:00Z', progressRow(faker.userId, activities[1].id).join(' '));
  psql(`update itera.progress set completed_at = now(), written_by_client = true where user_id = :'user_id'::uuid and activity_id = :'activity'::uuid;`, { user_id: faker.userId, activity: activities[1].id });

  // 3. An honest day, written exactly as the player writes it: one activity at a time, progress then attempt.
  const startedAt = Date.now();
  for (const activity of activities) {
    await upsertProgress(honest, { user_id: honest.userId, activity_id: activity.id, status: 'completed', completed_at: new Date().toISOString() });
    await restAs(honest, 'POST', 'activity_results', { user_id: honest.userId, activity_id: activity.id, passed: true, score_internal: null, feedback: {} });
    await sleep(1_300);
  }
  console.log(`C honest day: ${activities.length} activities in ${((Date.now() - startedAt) / 1000).toFixed(1)} s`);
  const played = await honest.call('passport', { lang: 'en', lesson_id: lesson });
  // Hour medals (`early_bird` before 08:00, `night_owl` from 23:00, São Paulo time) may come along.
  const playedKeys = (played.body.awards ?? []).map((award) => award.key).sort();
  check('C passport for the honest day: stamp + certification + first medal, no `day_pending_review`', played.status === 200 && ['day_stamp', 'first_stamp', 'trail_pass'].every((key) => playedKeys.includes(key)) && !('day_pending_review' in played.body) && played.body.day_incomplete === null, `${playedKeys.join(',')} ${JSON.stringify(played.body.mint)}`);

  // 4. The faker waits and completes the last activity again: the span is fine now, the attempts are missing.
  await sleep(Math.max(0, 21_000 - (Date.now() - fabricatedAt)));
  await restAs(faker, 'PATCH', `progress?user_id=eq.${faker.userId}&activity_id=eq.${last.id}`, { status: 'in_progress', completed_at: null });
  await upsertProgress(faker, [{ user_id: faker.userId, activity_id: last.id, status: 'completed', completed_at: new Date().toISOString() }]);
  const slower = await faker.call('passport', { lang: 'en', lesson_id: lesson });
  check('C the fabricated day stretched past the floor, without attempts: still nothing (missing_results)', slower.status === 200 && slower.body.awards.length === 0 && slower.body.day_pending_review?.reason === 'missing_results' && achievementCount(faker.userId) === 0, JSON.stringify(slower.body.day_pending_review ?? null));
  console.log('C RESIDUAL (not fixed, by design of this build): a client that also writes fake attempts and waits 20 s IS stamped. Grading is client-side.');
}

const circuitRow = (id) => psql(`select coalesce(circuit_status, '') || '|' || coalesce(circuit_lamports, 0) || '|' || coalesce(circuit_signature, '') from itera.purchases where id = :'id'::uuid;`, { id }).split('|');
const circuitSettled = (id, tries = 30) => until(async () => circuitRow(id), ([status]) => status === 'sent' || status === 'skipped', tries, 2000);
/** Successful treasury transactions carrying a purchase's circuit memo: must be exactly one, whatever is retried. */
async function circuitTransfers(context, purchaseId) {
  const recent = await rpc('getSignaturesForAddress', [context.treasury.address, { limit: 200, commitment: 'confirmed' }]);
  return recent.filter((entry) => entry.err === null && (entry.memo ?? '').includes(`circuit:${purchaseId}`)).map((entry) => entry.signature);
}
const pokeCircuit = () => fetch(`${FUNCTIONS}/circuit?t=${Date.now()}`).then((response) => response.status);

// --- J. Circuito: off the response path, with a safe retry ------------------------------------------
// Spends: two purchases of a throwaway wallet funded by the treasury (the money comes back) and
// their two circuit transfers treasury -> authority. No mint.
async function circuitRobustness(context) {
  const PRICE = 1_100_000n;
  const SHARE = 550_000;
  const buyer = await newLearner(context.apikey, 'J buyer');
  await fundFromTreasury(context, buyer.address, 2n * (PRICE + 5_000n));

  // 1. A purchase that was marked paid and whose function died before the transfer ("never ran").
  const first = await buyer.call('purchase-intent', { item_key: 'outfit_glasses' });
  const firstSignature = await signAndSend(buyer, Buffer.from(first.body.message_base64, 'base64'));
  const firstId = first.body.intent_id;
  const settled = psql(`select itera.settle_payment('purchase', :'id'::uuid, :'signature', 1100000);`, { id: firstId, signature: firstSignature });
  const neverRanAt = Date.now();
  check('J setup: a paid purchase whose transfer never ran', settled === 'settled' && circuitRow(firstId)[0] === '', `${settled} "${circuitRow(firstId)[0]}"`);

  // 2. A normal purchase: the answer must not wait for the transfer.
  const second = await buyer.call('purchase-intent', { item_key: 'outfit_headphones' });
  const secondSignature = await signAndSend(buyer, Buffer.from(second.body.message_base64, 'base64'));
  const secondId = second.body.intent_id;
  await sleep(2_500);
  const startedAt = Date.now();
  const confirmed = await until(() => buyer.call('purchase-confirm', { intent_id: secondId, signature: secondSignature, lang: 'en' }), (answer) => answer.body.error !== 'tx_not_found', 6, 1500);
  const elapsed = Date.now() - startedAt;
  const answer = confirmed.body.circuit;
  console.log(`J purchase-confirm answered in ${elapsed} ms · circuit ${JSON.stringify(answer ?? null)}`);
  check('J purchase-confirm: paid, with the share stated from the paid row and no transaction yet', confirmed.status === 200 && confirmed.body.status === 'paid' && answer?.status === 'pending' && answer.lamports === SHARE && answer.stamps_funded === 110 && answer.tx_signature === null, JSON.stringify(answer ?? null));
  // A cold function start alone can take 2-3 s; the transfer itself needs 3-6 s more, which this must not include.
  check('J purchase-confirm did not wait for the transfer (under 5 s, cold start included)', elapsed < 5_000, `${elapsed} ms`);
  const [status, lamports, signature] = await circuitSettled(secondId);
  check('J the transfer ran after the response: sent, half of the row', status === 'sent' && Number(lamports) === SHARE && signature.length > 40, `${status} ${lamports}`);
  const replay = await buyer.call('purchase-confirm', { intent_id: secondId, signature: secondSignature });
  check('J repeating the confirm: the confirmed transfer, nothing new', replay.body.circuit?.status === 'sent' && replay.body.circuit.tx_signature === signature && (await circuitTransfers(context, secondId)).length === 1, JSON.stringify(replay.body.circuit ?? null));

  // 3. The retry takes the purchase whose transfer never ran (a minute after it was paid).
  await sleep(Math.max(0, 63_000 - (Date.now() - neverRanAt)));
  await pokeCircuit();
  const [firstStatus, firstLamports, firstCircuit] = await circuitSettled(firstId);
  const firstOnChain = await circuitTransfers(context, firstId);
  check('J retry (on a `circuit` call): the transfer that never ran is sent, once', firstStatus === 'sent' && Number(firstLamports) === SHARE && firstOnChain.length === 1 && firstOnChain[0] === firstCircuit, `${firstStatus} ${firstLamports} on chain ${firstOnChain.length}`);

  // 4. A transfer that landed but whose record was lost: found on chain by its memo, NOT sent again.
  psql(`update itera.purchases set circuit_status = 'failed', circuit_signature = null, circuit_lamports = null, circuit_reason = 'security-attacks: record lost', circuit_at = now() - interval '10 minutes' where id = :'id'::uuid;`, { id: secondId });
  await pokeCircuit();
  const recovered = await circuitSettled(secondId, 15);
  check('J retry of a `failed` transfer that is on chain: recorded with the SAME transaction, not sent twice', recovered[0] === 'sent' && recovered[2] === signature && Number(recovered[1]) === SHARE && (await circuitTransfers(context, secondId)).length === 1, `${recovered[0]} same=${recovered[2] === signature}`);

  // 5. A claim left `pending` with its signature saved at broadcast time: the chain is asked about that signature.
  psql(`update itera.purchases set circuit_status = 'pending', circuit_at = now() - interval '10 minutes' where id = :'id'::uuid;`, { id: firstId });
  await pokeCircuit();
  const resumed = await circuitSettled(firstId, 15);
  check('J retry of a stale `pending` claim whose signature landed: recorded, not sent twice', resumed[0] === 'sent' && resumed[2] === firstCircuit && (await circuitTransfers(context, firstId)).length === 1, `${resumed[0]} same=${resumed[2] === firstCircuit}`);

  const applied = await buyer.call('purchase-confirm', { intent_id: firstId, signature: firstSignature });
  check('J the first purchase confirms normally afterwards and reports its confirmed transfer', applied.status === 200 && applied.body.circuit?.status === 'sent' && applied.body.circuit.tx_signature === firstCircuit && applied.body.inventory?.some((entry) => entry.item_key === 'outfit_glasses'), JSON.stringify(applied.body.circuit ?? null));
}

const assetWrites = async (asset) => (await rpc('getSignaturesForAddress', [asset, { limit: 100, commitment: 'confirmed' }])).filter((entry) => entry.err === null).length;
async function chainAttributes(asset) {
  const body = await (await fetch(`${FUNCTIONS}/credential-verify/${asset}?t=${Date.now()}`)).json();
  return Object.fromEntries((body.attributes ?? []).map(({ key, value }) => [key, value]));
}
const mirrorRow = (userId) => psql(`select mirror_due || '|' || mirror_writes || '|' || coalesce(mirror_error, '') || '|' || lives from itera.companions where user_id = :'user_id'::uuid;`, { user_id: userId }).split('|');

// --- D. Finding 4: unbounded authority-paid writes --------------------------------------------------
// Spends: ONE companion mint (about 0.004 SOL of the authority) and four attribute writes (5 000
// lamports each); one refill paid by a throwaway wallet funded from the treasury.
async function mirrorBounds(context) {
  const learner = await keptLearner(context.apikey, 'D learner', 'd-learner');
  // A second run reuses the companion; its state is put back to a clean start (lives 5, no outfit, mirrored long ago).
  psql(`update itera.companions set lives = max_lives, last_regen_at = now(), outfit = null, version = version + 1, mirror_writes = 0, mirror_retry_at = null where user_id = :'user_id'::uuid;`, { user_id: learner.userId });
  psql(`insert into itera.user_inventory (user_id, item_key, ref_id, qty) values (:'user_id'::uuid, 'outfit_glasses', '00000000-0000-0000-0000-000000000000', 1), (:'user_id'::uuid, 'outfit_headphones', '00000000-0000-0000-0000-000000000000', 1) on conflict do nothing;`, { user_id: learner.userId });
  await learner.call('companion');
  const minted = await until(() => learner.call('companion'), (answer) => answer.body.companion?.mint_status === 'minted', 40, 2000);
  const asset = minted.body.companion?.asset_address;
  check('D setup: a minted companion that owns two outfits (seeded, not bought)', Boolean(asset), JSON.stringify(minted.body.companion ?? null).slice(0, 120));
  // The refill (550 000 + fee) plus the rent-exempt minimum a funded account must keep; what is left is swept back at the end.
  const need = 555_000n + 890_880n - (await balance(learner.address));
  if (need > 0n) await fundFromTreasury(context, learner.address, need);
  await sleep(31_000);
  const writesBefore = await assetWrites(asset);

  // 1. The loop of the review: alternate two owned outfits as fast as the function answers.
  const loopStartedAt = Date.now();
  const toggles = ['outfit_glasses', 'outfit_headphones', 'outfit_glasses', 'outfit_headphones', 'outfit_glasses', 'outfit_headphones', 'outfit_glasses', 'outfit_headphones'];
  for (const outfit of toggles) await learner.call('companion', { equip: { outfit } });
  await sleep(6_000);
  const duringLoop = (await assetWrites(asset)) - writesBefore;
  const flagged = mirrorRow(learner.userId);
  check(`D ${toggles.length} equip changes in ${((Date.now() - loopStartedAt) / 1000).toFixed(0)} s: ONE on-chain write, the rest held (row flagged mirror_due)`, duringLoop === 1 && flagged[0] === 'true', `${duringLoop} write(s), mirror_due=${flagged[0]} (${flagged[2]})`);
  const caughtUp = await until(() => chainAttributes(asset), (attributes) => attributes.outfit === 'outfit_headphones', 25, 2000);
  const afterWindow = (await assetWrites(asset)) - writesBefore;
  check('D when the 30 s window ends the LATEST state is written, once (coalesced)', caughtUp.outfit === 'outfit_headphones' && afterWindow === 2 && mirrorRow(learner.userId)[0] === 'false', `${afterWindow} writes in total, outfit ${caughtUp.outfit}`);

  // 2. The two moments of the demo skip the cooldown.
  psql(`update itera.companions set lives = 1, last_regen_at = now(), version = version + 1 where user_id = :'user_id'::uuid;`, { user_id: learner.userId });
  const { activities } = lessonActivities(2);
  const zero = await learner.call('lives', { action: 'lose', attempt_id: `sec-${Date.now()}`, activity_id: activities[0].id });
  const zeroOnChain = await until(() => chainAttributes(asset), (attributes) => attributes.lives === '0', 10, 1500);
  check('D lives reaching 0 right after another write: mirrored at once', zero.body.lives?.current === 0 && zeroOnChain.lives === '0', `chain ${JSON.stringify(zero.body.chain ?? null).slice(0, 80)} · on chain lives ${zeroOnChain.lives}`);
  const intent = await learner.call('purchase-intent', { item_key: 'life_refill' });
  const signature = await signAndSend(learner, Buffer.from(intent.body.message_base64, 'base64'));
  const refill = await until(() => learner.call('purchase-confirm', { intent_id: intent.body.intent_id, signature, lang: 'en' }), (answer) => answer.body.error !== 'tx_not_found', 6, 1500);
  const fullOnChain = await until(() => chainAttributes(asset), (attributes) => attributes.lives === '5', 10, 1500);
  check('D a refill bought seconds later: mirrored at once (lives 5 on chain)', refill.status === 200 && refill.body.lives?.current === 5 && fullOnChain.lives === '5', `chain ${JSON.stringify(refill.body.chain ?? null).slice(0, 80)} · on chain lives ${fullOnChain.lives}`);
  const counted = Number(mirrorRow(learner.userId)[1]);
  check('D every write was counted for the day (4)', counted === 4 && (await assetWrites(asset)) - writesBefore === 4, `counter ${counted}`);

  // 3. The daily cap stops even those.
  psql(`update itera.companions set mirror_writes = 60, mirror_day = (now() at time zone 'utc')::date, lives = 1, last_regen_at = now(), version = version + 1 where user_id = :'user_id'::uuid;`, { user_id: learner.userId });
  const capped = await learner.call('lives', { action: 'lose', attempt_id: `sec-cap-${Date.now()}`, activity_id: activities[0].id });
  await sleep(5_000);
  const afterCap = mirrorRow(learner.userId);
  check('D past 60 writes in a day: the database is right (lives 0), nothing is sent, the row waits', capped.body.lives?.current === 0 && !('chain' in capped.body) && afterCap[0] === 'true' && afterCap[2] === 'daily_cap' && afterCap[3] === '0' && (await chainAttributes(asset)).lives === '5' && (await assetWrites(asset)) - writesBefore === 4, afterCap.join(' '));
  psql(`update itera.companions set mirror_writes = 4 where user_id = :'user_id'::uuid;`, { user_id: learner.userId });
  await sweepToTreasury(context, learner);
}

function json(sql, variables = {}) {
  return JSON.parse(psql(sql, variables) || 'null') ?? [];
}

// --- Owner's account: READ-ONLY dry check -----------------------------------------------------------
// Fetches the real rows with SELECTs only and runs the pure awarding function on them, with the last
// activities of the open day added in memory as the player will write them. Writes nothing anywhere.
async function ownerDryCheck() {
  const OWNER = '0b836ee9-f287-4188-95b1-5557d5a7cca2';
  const { computeAwards, dayPendingReview, dayIncomplete } = await import('../../supabase/functions/_shared/awards.ts');
  const variables = { user_id: OWNER };
  const tree = {
    programs: json(`select json_agg(json_build_object('id', id, 'slug', slug, 'title', title_i18n)) from itera.programs where archived_at is null;`),
    units: json(`select json_agg(json_build_object('id', id, 'program_id', program_id, 'ordinal', ordinal, 'title', title_i18n)) from itera.units;`),
    lessons: json(`select json_agg(json_build_object('id', id, 'unit_id', unit_id, 'ordinal', ordinal, 'title', title_i18n)) from itera.lessons;`),
    activities: json(`select json_agg(json_build_object('id', id, 'lesson_id', lesson_id) order by lesson_id, ordinal, id) from itera.activities where status = 'published';`),
  };
  const progress = json(`select json_agg(json_build_object('activity_id', activity_id, 'status', status, 'completed_at', completed_at, 'written_by_client', written_by_client)) from itera.progress where user_id = :'user_id'::uuid and status = 'completed';`, variables);
  const passed = json(`select json_agg(distinct activity_id) from itera.activity_results where user_id = :'user_id'::uuid and passed;`, variables);
  const existing = json(`select json_agg(json_build_object('achievement_key', achievement_key, 'ref_id', ref_id, 'state', state)) from itera.user_achievements where user_id = :'user_id'::uuid;`, variables);
  const base = { ...tree, existing, timeZone: 'America/Sao_Paulo' };
  const summarize = (awards) => awards.map((award) => `${award.op}:${award.key}${award.key === 'trail_pass' ? `(${award.state.days_done}/${award.state.total_days} ${award.state.tier})` : award.key === 'day_stamp' ? `(day ${award.state.day})` : ''}`).join(', ') || '(nothing)';

  const completed = new Set(progress.map((row) => row.activity_id));
  const stamped = new Set(existing.filter((row) => row.achievement_key === 'day_stamp').map((row) => row.ref_id));
  const pass = existing.find((row) => row.achievement_key === 'trail_pass');
  const open = tree.lessons
    .filter((lesson) => lesson.unit_id === pass?.ref_id && !stamped.has(lesson.id))
    .map((lesson) => ({ lesson, activities: tree.activities.filter((activity) => activity.lesson_id === lesson.id) }))
    .find((entry) => entry.activities.length > 0);
  const missing = open.activities.filter((activity) => !completed.has(activity.id));
  console.log(`owner ${OWNER}: ${existing.length} achievement rows, certification ${pass?.state.days_done}/${pass?.state.total_days} ${pass?.state.tier}`);
  console.log(`open day: lesson ${open.lesson.id}, ${open.activities.length - missing.length}/${open.activities.length} activities completed, ${missing.length} left`);

  const today = { ...base, progress, passedActivityIds: passed };
  console.log(`as it is now      -> awards: ${summarize(computeAwards(today))} · day_pending_review: ${JSON.stringify(dayPendingReview(today, open.lesson.id))} · day_incomplete: ${JSON.stringify(dayIncomplete(today, open.lesson.id))}`);

  const now = Date.now();
  const live = missing.map((activity, index) => ({ activity_id: activity.id, status: 'completed', completed_at: new Date(now + index * 8_000).toISOString(), written_by_client: true }));
  const after = { ...base, progress: [...progress, ...live], passedActivityIds: [...passed, ...missing.map((activity) => activity.id)] };
  const awards = computeAwards(after);
  console.log(`after the last ${missing.length} live -> awards: ${summarize(awards)} · day_pending_review: ${JSON.stringify(dayPendingReview(after, open.lesson.id))} · day_incomplete: ${JSON.stringify(dayIncomplete(after, open.lesson.id))}`);
  const stamp = awards.find((award) => award.key === 'day_stamp' && award.ref_id === open.lesson.id);
  const gold = awards.find((award) => award.key === 'trail_pass' && award.op === 'update' && award.state.tier === 'gold' && award.state.days_done === award.state.total_days);
  check('OWNER (read-only): completing the last activities live still awards the stamp + gold', missing.length === 2 && Boolean(stamp) && Boolean(gold) && dayPendingReview(after, open.lesson.id) === null, summarize(awards));
  check('OWNER (read-only): nothing is awarded or changed for the account as it is now', computeAwards(today).filter((award) => award.key !== 'weekly_goal').length === 0 && dayPendingReview(today, null) === null, summarize(computeAwards(today)));
}

const SECTIONS = {
  a: ['A. pay once, get two (finding 2)', payOnceGetTwo],
  b: ['B. forgeable XP (finding 3)', forgeXp],
  c: ['C. client-written progress (finding 1, mitigations)', fakeProgress],
  j: ['J. Circuito off the response path + idempotent retry', circuitRobustness],
  d: ['D. unbounded authority-paid writes (finding 4)', mirrorBounds],
  owner: ['Owner account, read-only dry check', ownerDryCheck],
};

async function main() {
  const wanted = process.argv.slice(2).map((name) => name.toLowerCase());
  const names = wanted.length > 0 ? wanted : Object.keys(SECTIONS);
  const unknown = names.filter((name) => !SECTIONS[name]);
  if (unknown.length > 0) throw new Error(`unknown section(s): ${unknown.join(', ')} (known: ${Object.keys(SECTIONS).join(', ')})`);

  const context = { apikey: await anonKey(), treasury: loadTreasury() };
  const before = await balances(context, 'start');
  for (const name of names) {
    const [title, run] = SECTIONS[name];
    console.log(`\n=== ${title} ===`);
    await guard(context, title);
    await run(context);
    await balances(context, `after ${title}`);
  }
  const after = await balances(context, 'end');
  console.log(`\nauthority: ${sol(before.authority)} -> ${sol(after.authority)} SOL (${sol(after.authority - before.authority)})`);
  console.log(`treasury:  ${sol(before.treasury)} -> ${sol(after.treasury)} SOL (${sol(after.treasury - before.treasury)})`);
  const { total, failed } = summary();
  console.log(`\n${total - failed.length}/${total} checks passed${failed.length ? `\nFAILED:\n  ${failed.join('\n  ')}` : ''}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('security-attacks failed:', error);
  process.exit(1);
});
