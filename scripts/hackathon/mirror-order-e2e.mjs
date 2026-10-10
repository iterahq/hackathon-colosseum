#!/usr/bin/env node
// Devnet check that the companion's asset always ends at the database's latest
// state, however close together two mirror moments are. One throwaway wallet
// learner, deleted at the end (keep it with --keep).
//
//   node scripts/hackathon/mirror-order-e2e.mjs [--keep]
//
// (a) lose the last life (mirror lives = 0) and pay `life_refill` (mirror lives = 5):
//     right after the lose answers, and with both requests in the air at once. Three rounds each.
// (b) equip an outfit right after a `lesson_end` mirror.
// After each, `credential-verify` must reach the database's values within 30 s and hold them for 10 s.
//
// Environment (source ~/.config/itera-hackathon/supabase.env): HACKATHON_DB_PASSWORD,
// SUPABASE_ACCESS_TOKEN, HACKATHON_AUTHORITY_KEYFILE (default ~/.config/itera-hackathon/devnet-authority.json).
// Spends about 0.02 SOL of the authority.
import { execFileSync } from 'node:child_process';
import { createPrivateKey, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import {
  base58Encode,
  base64Encode,
  buildTransferMessage,
  serializeTransaction,
} from '../../supabase/functions/_shared/solana-tx.ts';

const PROJECT_REF = 'nyzcbnnbffsizshiolbh';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const FUNCTIONS = `${SUPABASE_URL}/functions/v1`;
const DB_URL = `postgresql://postgres.${PROJECT_REF}@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require`;
const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const SIWS_HOST = 'hackathon.iterahq.dev';
const PROGRAM_SLUG = 'itera-v2';
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const WALLET_FUNDING = 12_000_000n;
const ROUNDS = 3;
const SETTLE_MS = 30_000;
const HOLD_MS = 10_000;
const KEEP = process.argv.includes('--keep');

const results = [];
const created = [];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function check(name, pass, detail = '') {
  results.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 140)})` : ''}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sol = (lamports) => (Number(lamports) / 1e9).toFixed(6);
const brief = (response) => `${response.status} ${JSON.stringify(response.body)}`;

function psql(sql, variables = {}) {
  const args = [DB_URL, '-X', '-At', '-v', 'ON_ERROR_STOP=1'];
  for (const [name, value] of Object.entries(variables)) args.push('-v', `${name}=${value}`);
  return execFileSync('psql', args, { input: sql, encoding: 'utf8', env: { ...process.env, PGPASSWORD: requireEnv('HACKATHON_DB_PASSWORD') } }).trim();
}

async function rpc(method, params) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (response.status === 429 && attempt < 5) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    const payload = await response.json();
    if (payload.error) throw new Error(`${method}: ${JSON.stringify(payload.error).slice(0, 300)}`);
    return payload.result;
  }
}

const balance = async (address) => BigInt((await rpc('getBalance', [address, { commitment: 'confirmed' }])).value);

async function waitConfirmed(signature) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const status = (await rpc('getSignatureStatuses', [[signature]])).value[0];
    if (status?.err) throw new Error(`transaction ${signature} failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return;
    await sleep(700);
  }
  throw new Error(`transaction ${signature} was not confirmed`);
}

function newWallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { privateKey, address: base58Encode(publicKey.export({ type: 'spki', format: 'der' }).subarray(-32)) };
}

function loadAuthority() {
  const file = process.env.HACKATHON_AUTHORITY_KEYFILE ?? `${homedir()}/.config/itera-hackathon/devnet-authority.json`;
  const secret = Uint8Array.from(JSON.parse(readFileSync(file, 'utf8')));
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(secret.slice(0, 32))]), format: 'der', type: 'pkcs8' });
  return { privateKey, address: base58Encode(secret.slice(32)) };
}

/** What `provider.signMessage(bytes)` returns: the ed25519 signature over the bytes. */
const signBytes = (signer, bytes) => new Uint8Array(sign(null, Buffer.from(bytes), signer.privateKey));
const signText = (signer, text) => signBytes(signer, new TextEncoder().encode(text));
/** What `provider.signTransaction` returns, serialized: the message with the wallet's signature in front. */
const signTransaction = (signer, message) => serializeTransaction(message, signBytes(signer, message));

async function fund(authority, recipient, lamports) {
  const { blockhash } = (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
  const message = buildTransferMessage({ payer: authority.address, recipient, lamports, memo: 'e2e: mirror order funding', recentBlockhash: blockhash });
  const signature = await rpc('sendTransaction', [base64Encode(signTransaction(authority, message)), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
  await waitConfirmed(signature);
}

async function projectKeys() {
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${requireEnv('SUPABASE_ACCESS_TOKEN')}` },
  });
  if (!response.ok) throw new Error(`could not read the project API keys (HTTP ${response.status})`);
  const keys = await response.json();
  const service = keys.find((entry) => entry.name === 'service_role')?.api_key ?? keys.find((entry) => entry.type === 'secret')?.api_key;
  const anon = keys.find((entry) => entry.name === 'anon')?.api_key;
  if (!anon || !service) throw new Error('the project is missing an anon or a service key');
  return { anon, service };
}

async function token(apikey, grant, body) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST',
    headers: { apikey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(`sign-in (${grant}) failed: HTTP ${response.status}`);
  return payload;
}

const adminHeaders = (serviceKey) => ({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' });

function iteraUserId(authUserId) {
  return psql(`select user_id from itera.identities where provider_subject = :'subject' limit 1;`, { subject: authUserId });
}

async function createWalletLearner(keys) {
  const wallet = newWallet();
  const message = [
    `${SIWS_HOST} wants you to sign in with your Solana account:`,
    wallet.address,
    '',
    'Sign in to Itera Hackathon',
    '',
    `URI: https://${SIWS_HOST}/login`,
    'Version: 1',
    `Issued At: ${new Date().toISOString()}`,
  ].join('\n');
  const signature = Buffer.from(signText(wallet, message)).toString('base64url');
  const session = await token(keys.anon, 'web3', { chain: 'solana', message, signature });
  const userId = iteraUserId(session.user.id);
  created.push({ label: 'wallet', authUserId: session.user.id, userId });
  return { wallet, userId, call: client(keys.anon, session.access_token) };
}

function client(apikey, accessToken) {
  return async (name, body = {}) => {
    const headers = { apikey, 'Content-Type': 'application/json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await fetch(`${FUNCTIONS}/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
}

async function publicGet(path) {
  const response = await fetch(`${FUNCTIONS}/${path}`);
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text), text };
  } catch {
    return { status: response.status, body: null, text };
  }
}

async function until(read, done, tries = 40, pauseMs = 1500) {
  let last;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    last = await read();
    if (done(last)) return last;
    await sleep(pauseMs);
  }
  return last;
}

const attributesOf = (verify) => Object.fromEntries((verify.body?.attributes ?? []).map(({ key, value }) => [key, value]));
const verifyAsset = (asset) => publicGet(`credential-verify/${asset}?t=${Date.now()}`);

/** The first trail of the program: its unit id and, per day, the lesson and one published activity. */
function loadTrail() {
  const rows = psql(
    `select u.id, l.id, min(a.id::text)
     from itera.programs p
     join itera.units u on u.program_id = p.id
     join itera.lessons l on l.unit_id = u.id
     join itera.activities a on a.lesson_id = l.id and a.status = 'published'
     where p.slug = :'program' and u.ordinal = (select min(ordinal) from itera.units where program_id = p.id)
     group by u.id, l.id, l.ordinal order by l.ordinal, l.id;`,
    { program: PROGRAM_SLUG },
  );
  const days = rows.split('\n').map((line) => {
    const [unitId, lessonId, activityId] = line.split('|');
    return { unitId, lessonId, activityId };
  });
  return { unitId: days[0].unitId, days };
}

function completeLessons(userId, lessonIds) {
  psql(
    `insert into itera.progress (user_id, activity_id, status, completed_at)
     select :'user_id'::uuid, a.id, 'completed', now() from itera.activities a
     where a.status = 'published' and a.lesson_id = any (string_to_array(:'lessons', ',')::uuid[])
     on conflict (user_id, activity_id) do update set status = 'completed', completed_at = excluded.completed_at;`,
    { user_id: userId, lessons: lessonIds.join(',') },
  );
}

async function removeCreatedUsers(keys) {
  for (const user of created) {
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.authUserId}`, { method: 'DELETE', headers: adminHeaders(keys.service) });
      if (!response.ok) throw new Error(`auth delete HTTP ${response.status}`);
      psql(
        `delete from itera.tenants t using itera.memberships m
         where m.tenant_id = t.id and m.user_id = :'user_id'::uuid and m.role = 'owner' and t.slug like 'plg-%';
         delete from itera.users where id = :'user_id'::uuid;`,
        { user_id: user.userId },
      );
      console.log(`removed ${user.label} user ${user.userId}`);
    } catch (error) {
      console.log(`LEFT BEHIND ${user.label} user ${user.userId} (auth ${user.authUserId}): ${error.message}`);
    }
  }
}


const chainOf = async (asset) => attributesOf(await verifyAsset(asset));
const dbLives = (userId) => psql(`select lives from itera.companions where user_id = :'user_id'::uuid;`, { user_id: userId });

/** Polls the asset until every expected attribute holds one of its accepted values, then keeps reading for `HOLD_MS`. */
async function settleAndHold(asset, expected, startedAt) {
  const matches = (attributes) => Object.entries(expected).every(([key, values]) => values.includes(attributes[key]));
  let reachedMs = null;
  let seen = {};
  while (Date.now() - startedAt < SETTLE_MS) {
    seen = await chainOf(asset);
    if (matches(seen)) {
      reachedMs = Date.now() - startedAt;
      break;
    }
    await sleep(1000);
  }
  if (reachedMs === null) return { reachedMs, held: false, seen };
  const holdUntil = Date.now() + HOLD_MS;
  while (Date.now() < holdUntil) {
    await sleep(2000);
    seen = await chainOf(asset);
    if (!matches(seen)) return { reachedMs, held: false, seen };
  }
  return { reachedMs, held: true, seen };
}

/** Lives down to 1, a refill paid on chain and not yet confirmed to the server. */
async function armRefill(learner, wallet, activityId, tag) {
  const current = Number(dbLives(learner.userId));
  for (let index = 0; index < current - 1; index += 1) {
    await learner.call('lives', { action: 'lose', attempt_id: `mirror-${tag}-${index}`, activity_id: activityId });
  }
  const intent = await learner.call('purchase-intent', { item_key: 'life_refill' });
  if (intent.status !== 200) throw new Error(`purchase-intent: ${brief(intent)}`);
  const signed = signTransaction(wallet, new Uint8Array(Buffer.from(intent.body.message_base64, 'base64')));
  const signature = await rpc('sendTransaction', [base64Encode(signed), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
  await waitConfirmed(signature);
  return { intentId: intent.body.intent_id, signature };
}

async function main(keys) {
  const authority = loadAuthority();
  const treasury = psql(`select value from itera.onchain_config where key = 'treasury';`);
  const before = { authority: await balance(authority.address), treasury: await balance(treasury) };
  console.log(`authority ${sol(before.authority)} SOL · treasury ${sol(before.treasury)} SOL`);

  const trail = loadTrail();
  const [day1, day2] = trail.days;
  const learner = await createWalletLearner(keys);
  const { wallet } = learner;
  await fund(authority, wallet.address, WALLET_FUNDING);
  await learner.call('companion');
  const minted = await until(() => learner.call('companion'), (response) => response.body.companion?.mint_status !== 'pending', 60, 2000);
  const asset = minted.body.companion.asset_address;
  check('setup: companion minted', minted.body.companion.mint_status === 'minted' && Boolean(asset), asset);
  console.log(`wallet learner ${learner.userId} · companion ${asset}`);
  const run = randomBytes(3).toString('hex');
  const timings = [];

  for (const variant of ['sequential', 'concurrent']) {
    for (let round = 1; round <= ROUNDS; round += 1) {
      const tag = `${run}-${variant}-${round}`;
      const { intentId, signature } = await armRefill(learner, wallet, day2.activityId, tag);
      const lose = () => learner.call('lives', { action: 'lose', attempt_id: `mirror-${tag}-last`, activity_id: day2.activityId });
      const confirm = () => learner.call('purchase-confirm', { intent_id: intentId, signature, lang: 'en' });
      const startedAt = Date.now();
      let lost;
      let paid;
      if (variant === 'sequential') {
        lost = await lose();
        paid = await confirm();
      } else {
        [lost, paid] = await Promise.all([lose(), confirm()]);
      }
      const answeredMs = Date.now() - startedAt;
      const lives = dbLives(learner.userId);
      // Refill first, then the lose as an ordinary mistake (5 -> 4): that mistake is not mirrored, so 5 may stay.
      const outcome = await settleAndHold(asset, { lives: lives === '4' ? ['4', '5'] : [lives] }, startedAt);
      const flags = psql(`select mirror_claimed_at is null, mirror_dirty, mirror_due from itera.companions where user_id = :'user_id'::uuid;`, { user_id: learner.userId });
      timings.push({ variant, round, answeredMs, ...outcome, lives, loseChain: lost.body.chain?.lives ?? null, paidChain: paid.body.chain?.lives ?? null });
      check(`${variant} ${round}: both requests succeed`, lost.status === 200 && paid.status === 200 && paid.body.status === 'paid', `${lost.status}/${brief(paid).slice(0, 60)}`);
      check(`${variant} ${round}: the database ends refilled`, variant === 'sequential' ? lives === '5' : lives === '5' || lives === '4', `db lives ${lives}`);
      check(`${variant} ${round}: the asset reaches the database's lives within 30 s and holds 10 s`, outcome.reachedMs !== null && outcome.held, `db ${lives}, chain ${outcome.seen.lives}, reached ${outcome.reachedMs} ms`);
      check(`${variant} ${round}: a returned \`chain\` carries a value that was written (0 for the lose, the refilled lives for the confirm)`, (lost.body.chain === undefined || lost.body.chain.lives === 0 || lost.body.chain.lives === Number(lives)) && (paid.body.chain === undefined || paid.body.chain.lives >= 4), `lose.chain ${lost.body.chain?.lives ?? 'absent'}, confirm.chain ${paid.body.chain?.lives ?? 'absent'}`);
      check(`${variant} ${round}: the mirror is released, clean and not owed`, flags === 't|f|f', flags);
    }
  }

  // --- (b) an equip right after a lesson_end mirror --------------------------------------------
  const glasses = await learner.call('purchase-intent', { item_key: 'outfit_glasses' });
  const glassesTx = signTransaction(wallet, new Uint8Array(Buffer.from(glasses.body.message_base64, 'base64')));
  const bought = await until(() => learner.call('purchase-submit', { intent_id: glasses.body.intent_id, signed_transaction: base64Encode(glassesTx) }), (response) => response.body.error !== 'tx_not_found', 5, 1500);
  check('outfit: bought', bought.status === 200 && bought.body.status === 'paid', brief(bought).slice(0, 80));
  const start = Number(dbLives(learner.userId));
  for (let index = 0; index < start - 3; index += 1) {
    await learner.call('lives', { action: 'lose', attempt_id: `mirror-${run}-equip-${index}`, activity_id: day2.activityId });
  }
  completeLessons(learner.userId, [day1.lessonId]);
  const startedAt = Date.now();
  const ended = await learner.call('lives', { action: 'lesson_end', lesson_id: day1.lessonId, mistakes: 0 });
  const equipped = await learner.call('companion', { equip: { outfit: 'outfit_glasses' } });
  const answeredMs = Date.now() - startedAt;
  const lives = dbLives(learner.userId);
  const outcome = await settleAndHold(asset, { lives: [lives], outfit: ['outfit_glasses'] }, startedAt);
  timings.push({ variant: 'lesson_end+equip', round: 1, answeredMs, ...outcome, lives, loseChain: null, paidChain: null });
  check('lesson_end then equip: both applied in the database', ended.body.bonus === 'granted' && lives === '4' && equipped.body.companion?.outfit === 'outfit_glasses', `${ended.body.bonus}, db lives ${lives}`);
  check('lesson_end then equip: the asset ends with the current lives AND outfit, and holds 10 s', outcome.reachedMs !== null && outcome.held, `chain lives ${outcome.seen.lives}, outfit ${outcome.seen.outfit}, reached ${outcome.reachedMs} ms`);
  const flags = psql(`select mirror_claimed_at is null, mirror_dirty, mirror_due from itera.companions where user_id = :'user_id'::uuid;`, { user_id: learner.userId });
  check('lesson_end then equip: the mirror is released, clean and not owed', flags === 't|f|f', flags);

  console.log('\n| scenario | round | answered ms | chain final after ms | held 10 s | db lives | chain lives | lose.chain | confirm.chain |\n|---|---|---|---|---|---|---|---|---|');
  for (const row of timings) {
    console.log(`| ${row.variant} | ${row.round} | ${row.answeredMs} | ${row.reachedMs ?? 'never'} | ${row.held ? 'yes' : 'NO'} | ${row.lives} | ${row.seen.lives} | ${row.loseChain ?? '-'} | ${row.paidChain ?? '-'} |`);
  }
  const after = { authority: await balance(authority.address), treasury: await balance(treasury) };
  console.log(`\nauthority: ${sol(before.authority)} -> ${sol(after.authority)} SOL (${sol(after.authority - before.authority)})`);
  console.log(`treasury:  ${sol(before.treasury)} -> ${sol(after.treasury)} SOL (${sol(after.treasury - before.treasury)})`);
}

const keys = await projectKeys();
let crashed = null;
try {
  await main(keys);
} catch (error) {
  crashed = error;
  console.error('mirror-order-e2e failed:', error);
}
if (KEEP) for (const user of created) console.log(`kept ${user.label} user ${user.userId}`);
else await removeCreatedUsers(keys);
const failed = results.filter((result) => !result.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 && !crashed ? 0 : 1);
