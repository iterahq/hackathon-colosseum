#!/usr/bin/env node
// End-to-end check of `link-wallet` and `purchase-submit` on Solana devnet, against
// the hackathon project. Throwaway users only: two e-mail learners and one wallet
// learner are created, and deleted at the end (keep them with --keep).
//
//   node scripts/hackathon/link-wallet-e2e.mjs [--keep]
//
// Environment (source ~/.config/itera-hackathon/supabase.env):
//   HACKATHON_DB_PASSWORD, SUPABASE_ACCESS_TOKEN,
//   HACKATHON_DEMO_EMAIL + HACKATHON_DEMO_PASSWORD (optional: a read-only `status` of the demo user),
//   HACKATHON_AUTHORITY_KEYFILE (default ~/.config/itera-hackathon/devnet-authority.json): funds the linked wallet.
//
// Spends about 0.03 SOL of the authority (0.02 SOL of wallet funding, a certification,
// a medal, a companion and attribute updates).
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
const SHARED_TENANT = 'dfl-batch';
const EMAIL_DOMAIN = 'e2e.hackathon.invalid';
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const WALLET_FUNDING = 20_000_000n;
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
const errorIs = (response, status, code) => response.status === status && response.body?.error === code;
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
  const message = buildTransferMessage({ payer: authority.address, recipient, lamports, memo: 'e2e: linked wallet funding', recentBlockhash: blockhash });
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

/** A confirmed e-mail learner made through the admin API, signed in with its password, with access to the program. */
async function createEmailLearner(keys, label) {
  const email = `link-${label}-${randomBytes(5).toString('hex')}@${EMAIL_DOMAIN}`;
  const password = randomBytes(18).toString('base64url');
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders(keys.service),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const user = await response.json();
  if (!response.ok || !user.id) throw new Error(`could not create the e-mail user (HTTP ${response.status})`);
  const userId = iteraUserId(user.id);
  created.push({ label: `e-mail ${label}`, authUserId: user.id, userId });
  psql(
    `insert into itera.memberships (user_id, tenant_id, role)
     select :'user_id'::uuid, id, 'learner' from itera.tenants where slug = :'tenant'
     on conflict (user_id, tenant_id) do nothing;`,
    { user_id: userId, tenant: SHARED_TENANT },
  );
  const session = await token(keys.anon, 'password', { email, password });
  return { userId, authUserId: user.id, call: client(keys.anon, session.access_token), accessToken: session.access_token };
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

/** A table read through the REST API as the learner: what RLS lets a client see. */
async function restRead(apikey, accessToken, table) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: { apikey, Authorization: `Bearer ${accessToken}`, 'Accept-Profile': 'itera' },
  });
  return { status: response.status, body: await response.json() };
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

/** Calls `passport` until nothing is left to mint, collecting every row it returned. */
async function passportUntilDone(call) {
  const rows = new Map();
  let last;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    last = await call('passport', { lang: 'en' });
    for (const row of [...(last.body.awards ?? []), ...(last.body.updated ?? [])]) rows.set(row.id, row);
    if (last.status !== 200 || last.body.mint?.blocked || last.body.remaining === 0) break;
  }
  return { last, rows: [...rows.values()] };
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

async function main(keys) {
  const authority = loadAuthority();
  const treasury = psql(`select value from itera.onchain_config where key = 'treasury';`);
  const before = { authority: await balance(authority.address), treasury: await balance(treasury) };
  console.log(`authority ${authority.address} ${sol(before.authority)} SOL · treasury ${treasury} ${sol(before.treasury)} SOL`);

  const trail = loadTrail();
  const [day1, day2] = trail.days;
  const learnerA = await createEmailLearner(keys, 'a');
  const learnerB = await createEmailLearner(keys, 'b');
  const walletLearner = await createWalletLearner(keys);
  const linked = newWallet();
  const stranger = newWallet();
  console.log(`A ${learnerA.userId} · B ${learnerB.userId} · wallet learner ${walletLearner.userId} · wallet to link ${linked.address}`);

  // --- requests that never reach the logic ----------------------------------------------------
  const anonymous = client(keys.anon, null);
  for (const name of ['link-wallet', 'purchase-submit']) {
    const response = await anonymous(name, {});
    check(`${name}: no token -> 401`, errorIs(response, 401, 'unauthorized'), brief(response));
  }
  for (const body of [{}, { action: 'unlink' }, { action: 'verify', challenge_id: 'nope', signature: 'x' }, { action: 'verify', challenge_id: randomUuid() }]) {
    const response = await learnerA.call('link-wallet', body);
    check(`link-wallet: ${JSON.stringify(body).slice(0, 40)} -> 400 invalid_body`, errorIs(response, 400, 'invalid_body'), brief(response));
  }
  for (const address of ['not-an-address', linked.address.slice(0, 20), 42, undefined]) {
    const response = await learnerA.call('link-wallet', { action: 'challenge', address });
    check(`link-wallet challenge: address ${String(address).slice(0, 20)} -> invalid_address`, errorIs(response, 400, 'invalid_address'), brief(response));
  }

  // --- an e-mail learner before linking -------------------------------------------------------
  completeLessons(learnerA.userId, [day1.lessonId, day2.lessonId]);
  const unlinked = await learnerA.call('passport', { lang: 'en' });
  const earned = unlinked.body.awards ?? [];
  check('before: passport earns rows and leaves them unclaimed', unlinked.status === 200 && earned.length >= 3 && earned.every((row) => row.mint_status === 'unclaimed' && !row.asset_address), `${earned.length} rows`);
  check('before: mint.blocked = no_wallet, mint.wallet = null', unlinked.body.mint?.blocked === 'no_wallet' && unlinked.body.mint?.wallet === null, JSON.stringify(unlinked.body.mint));
  let status = await learnerA.call('link-wallet', { action: 'status' });
  check('before: status -> { wallet: null, source: null }', status.status === 200 && status.body.wallet === null && status.body.source === null, brief(status));
  const refused = await learnerA.call('purchase-intent', { item_key: 'ink_emerald', ref_id: trail.unitId });
  check('before: purchase-intent -> no_wallet', errorIs(refused, 403, 'no_wallet'), brief(refused));

  // --- challenges -----------------------------------------------------------------------------
  const first = await learnerA.call('link-wallet', { action: 'challenge', address: linked.address });
  const lines = String(first.body.message ?? '').split('\n');
  const lifetime = new Date(first.body.expires_at).getTime() - Date.now();
  check('challenge: id, message and a five-minute expiry', first.status === 200 && /^[0-9a-f-]{36}$/.test(first.body.challenge_id) && lifetime > 280_000 && lifetime <= 300_000, `${Math.round(lifetime / 1000)} s`);
  check(
    'challenge: the message names the app, the wallet, a short account id, a nonce and both times',
    lines.length === 6 && lines[0].startsWith('Itera') && lines[1] === `Wallet: ${linked.address}` && lines[2] === `Account: ${learnerA.userId.slice(0, 8)}` &&
      /^Nonce: [0-9a-f]{32}$/.test(lines[3]) && lines[4].startsWith('Issued At: ') && lines[5] === `Expires At: ${first.body.expires_at}`,
    lines.slice(2, 4).join(' | '),
  );
  check('challenge: no whole user id and no e-mail in the message', !first.body.message.includes(learnerA.userId) && !first.body.message.includes('@'));

  const second = await learnerA.call('link-wallet', { action: 'challenge', address: linked.address });
  check('challenge: a new one has another nonce', second.status === 200 && second.body.challenge_id !== first.body.challenge_id && second.body.message !== first.body.message);
  const retired = await learnerA.call('link-wallet', { action: 'verify', challenge_id: first.body.challenge_id, signature: base58Encode(signText(linked, first.body.message)) });
  check('challenge: asking again retires the previous one (valid signature -> challenge_not_found)', errorIs(retired, 404, 'challenge_not_found'), brief(retired));
  const openChallenges = psql(`select count(*) from itera.wallet_link_challenges where user_id = :'user_id'::uuid;`, { user_id: learnerA.userId });
  check('challenge: one open challenge per learner', openChallenges === '1', openChallenges);

  const wrongKey = await learnerA.call('link-wallet', { action: 'verify', challenge_id: second.body.challenge_id, signature: base58Encode(signText(stranger, second.body.message)) });
  check('verify: signed by another key -> signature_invalid', errorIs(wrongKey, 422, 'signature_invalid'), brief(wrongKey));
  const otherChallenge = await learnerA.call('link-wallet', { action: 'verify', challenge_id: second.body.challenge_id, signature: base58Encode(signText(linked, first.body.message)) });
  check('verify: the signature of challenge A does not verify challenge B', errorIs(otherChallenge, 422, 'signature_invalid'), brief(otherChallenge));
  const garbage = await learnerA.call('link-wallet', { action: 'verify', challenge_id: second.body.challenge_id, signature: 'not a signature' });
  check('verify: undecodable signature -> signature_invalid', errorIs(garbage, 422, 'signature_invalid'), brief(garbage));
  const unknown = await learnerA.call('link-wallet', { action: 'verify', challenge_id: randomUuid(), signature: base58Encode(signText(linked, second.body.message)) });
  check('verify: unknown challenge -> challenge_not_found', errorIs(unknown, 404, 'challenge_not_found'), brief(unknown));
  const crossUser = await learnerB.call('link-wallet', { action: 'verify', challenge_id: second.body.challenge_id, signature: base58Encode(signText(linked, second.body.message)) });
  check('verify: learner B cannot verify learner A\'s challenge, even with a valid signature', errorIs(crossUser, 404, 'challenge_not_found'), brief(crossUser));
  check('verify: nothing was linked by any refusal', psql(`select count(*) from itera.user_wallets where user_id in (:'a'::uuid, :'b'::uuid);`, { a: learnerA.userId, b: learnerB.userId }) === '0');

  psql(`update itera.wallet_link_challenges set expires_at = now() - interval '1 second' where id = :'id'::uuid;`, { id: second.body.challenge_id });
  const late = await learnerA.call('link-wallet', { action: 'verify', challenge_id: second.body.challenge_id, signature: base58Encode(signText(linked, second.body.message)) });
  check('verify: past the expiry -> challenge_expired', errorIs(late, 410, 'challenge_expired'), brief(late));

  // --- a wallet that is already an account ----------------------------------------------------
  const walletChallenge = await walletLearner.call('link-wallet', { action: 'challenge', address: stranger.address });
  check('wallet account: challenge -> already_wallet_account', errorIs(walletChallenge, 409, 'already_wallet_account'), brief(walletChallenge));
  const walletVerify = await walletLearner.call('link-wallet', { action: 'verify', challenge_id: randomUuid(), signature: base58Encode(signText(stranger, 'x')) });
  check('wallet account: verify -> already_wallet_account', errorIs(walletVerify, 409, 'already_wallet_account'), brief(walletVerify));
  const walletStatus = await walletLearner.call('link-wallet', { action: 'status' });
  check('wallet account: status -> its sign-in wallet, source identity', walletStatus.body.wallet === walletLearner.wallet.address && walletStatus.body.source === 'identity', brief(walletStatus));
  const identityTaken = await learnerA.call('link-wallet', { action: 'challenge', address: walletLearner.wallet.address });
  check('linking a wallet that is someone\'s sign-in identity -> wallet_in_use', errorIs(identityTaken, 409, 'wallet_in_use'), brief(identityTaken));

  // --- link -----------------------------------------------------------------------------------
  // Learner B opens a challenge for the same wallet while it is still free.
  const rival = await learnerB.call('link-wallet', { action: 'challenge', address: linked.address });
  const third = await learnerA.call('link-wallet', { action: 'challenge', address: linked.address });
  const link = await learnerA.call('link-wallet', { action: 'verify', challenge_id: third.body.challenge_id, signature: base58Encode(signText(linked, third.body.message)) });
  check('verify: a base58 signature by the wallet links it', link.status === 200 && link.body.wallet === linked.address && !Number.isNaN(Date.parse(link.body.linked_at)), brief(link));
  check('verify: pending_mints counts the unclaimed rows', link.body.pending_mints === earned.length, `${link.body.pending_mints} of ${earned.length}`);
  const replay = await learnerA.call('link-wallet', { action: 'verify', challenge_id: third.body.challenge_id, signature: base58Encode(signText(linked, third.body.message)) });
  check('verify: replaying a used challenge -> challenge_expired', errorIs(replay, 410, 'challenge_expired'), brief(replay));
  const relink = await learnerA.call('link-wallet', { action: 'challenge', address: stranger.address });
  check('linked learner: another challenge -> already_linked', errorIs(relink, 409, 'already_linked'), brief(relink));
  const rivalVerify = await learnerB.call('link-wallet', { action: 'verify', challenge_id: rival.body.challenge_id, signature: Buffer.from(signText(linked, rival.body.message)).toString('base64') });
  check('learner B, valid base64 signature for a wallet A linked meanwhile -> wallet_in_use', rival.status === 200 && errorIs(rivalVerify, 409, 'wallet_in_use'), brief(rivalVerify));
  const rivalChallenge = await learnerB.call('link-wallet', { action: 'challenge', address: linked.address });
  check('learner B: challenge for A\'s wallet -> wallet_in_use', errorIs(rivalChallenge, 409, 'wallet_in_use'), brief(rivalChallenge));
  status = await learnerA.call('link-wallet', { action: 'status' });
  check('status: the linked wallet, source linked', status.body.wallet === linked.address && status.body.source === 'linked', brief(status));
  const statusB = await learnerB.call('link-wallet', { action: 'status' });
  check('status: learner B still has no wallet', statusB.body.wallet === null && statusB.body.source === null, brief(statusB));

  const ownRow = await restRead(keys.anon, learnerA.accessToken, 'user_wallets');
  const foreignRow = await restRead(keys.anon, learnerB.accessToken, 'user_wallets');
  const challengeRows = await restRead(keys.anon, learnerA.accessToken, 'wallet_link_challenges');
  check('RLS: a learner reads only their own user_wallets row', ownRow.body.length === 1 && ownRow.body[0].wallet === linked.address && Array.isArray(foreignRow.body) && foreignRow.body.length === 0, `${ownRow.status}/${foreignRow.status}`);
  check('RLS: challenges are not readable by clients', challengeRows.status >= 400 || challengeRows.body.length === 0, challengeRows.status);
  const forged = await fetch(`${SUPABASE_URL}/rest/v1/user_wallets`, {
    method: 'POST',
    headers: { apikey: keys.anon, Authorization: `Bearer ${learnerB.accessToken}`, 'Content-Profile': 'itera', 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: learnerB.userId, wallet: stranger.address }),
  });
  check('RLS: a client cannot write user_wallets', forged.status >= 400 && psql(`select count(*) from itera.user_wallets where user_id = :'b'::uuid;`, { b: learnerB.userId }) === '0', forged.status);

  // --- the existing flows now work for the e-mail learner -------------------------------------
  const smuggled = await learnerB.call('passport', { lang: 'en', wallet: linked.address, address: linked.address });
  check('a wallet in the request body is ignored (learner B stays without one)', smuggled.status === 200 && smuggled.body.mint?.wallet === null, JSON.stringify(smuggled.body.mint));

  const minting = await passportUntilDone(learnerA.call);
  const mintedRows = minting.rows.filter((row) => row.mint_status === 'minted');
  check('after: passport mints the unclaimed rows', minting.last.status === 200 && minting.last.body.remaining === 0 && minting.last.body.mint.wallet === linked.address && mintedRows.length === earned.length, `${mintedRows.length}/${earned.length} minted, blocked ${minting.last.body.mint?.blocked}`);
  const mintedTo = psql(`select count(*) filter (where wallet_address = :'wallet'), count(*) from itera.user_achievements where user_id = :'user_id'::uuid;`, { wallet: linked.address, user_id: learnerA.userId });
  check('after: every row is recorded for the linked wallet', mintedTo === `${earned.length}|${earned.length}`, mintedTo);
  const pass = minting.rows.find((row) => row.key === 'trail_pass');
  let verify = await verifyAsset(pass.asset_address);
  check('credential-verify: the certification is verified and owned by the linked wallet', verify.body.verified === true && verify.body.owner === linked.address && verify.body.frozen === true && attributesOf(verify).days_done === '2', `owner ${verify.body.owner}`);

  let companion = await learnerA.call('companion');
  check('companion: the first call starts a mint for the linked wallet', companion.status === 200 && companion.body.wallet === linked.address && companion.body.companion.mint_status === 'pending', brief(companion).slice(0, 120));
  companion = await until(() => learnerA.call('companion'), (response) => response.body.companion?.mint_status !== 'pending', 60, 2000);
  const companionAsset = companion.body.companion.asset_address;
  verify = await verifyAsset(companionAsset);
  check('companion: minted, verified and owned by the linked wallet', companion.body.companion.mint_status === 'minted' && verify.body.verified === true && verify.body.owner === linked.address, companionAsset);

  // --- purchase-submit ------------------------------------------------------------------------
  await fund(authority, linked.address, WALLET_FUNDING);
  const faucet = await learnerA.call('wallet-faucet');
  check('wallet-faucet: sees the linked wallet (funded, so not_needed)', faucet.status === 200 && faucet.body.blocked === 'not_needed', brief(faucet));

  const intent = await learnerA.call('purchase-intent', { item_key: 'ink_emerald', ref_id: trail.unitId });
  check('purchase-intent: works for the linked wallet', intent.status === 200 && typeof intent.body.message_base64 === 'string', brief(intent).slice(0, 120));
  const message = new Uint8Array(Buffer.from(intent.body.message_base64, 'base64'));
  const signedTransaction = signTransaction(linked, message);
  const submit = (call, intentId, bytes, encode = base64Encode) => call('purchase-submit', { intent_id: intentId, signed_transaction: encode(bytes), lang: 'en' });
  const { blockhash } = (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
  const rebuilt = (overrides) =>
    buildTransferMessage({ payer: linked.address, recipient: treasury, lamports: BigInt(intent.body.price_lamports), memo: intent.body.memo, recentBlockhash: blockhash, ...overrides });

  for (const body of [{ intent_id: intent.body.intent_id }, { intent_id: 'nope', signed_transaction: base64Encode(signedTransaction) }, { intent_id: intent.body.intent_id, signed_transaction: 42 }]) {
    const response = await learnerA.call('purchase-submit', body);
    check(`purchase-submit: ${Object.keys(body).join('+')} malformed -> invalid_body`, errorIs(response, 400, 'invalid_body'), brief(response));
  }
  for (const [label, text] of [['text', 'not a transaction'], ['a bare message', intent.body.message_base64], ['a truncated transaction', base64Encode(signedTransaction.subarray(0, 120))]]) {
    const response = await learnerA.call('purchase-submit', { intent_id: intent.body.intent_id, signed_transaction: text });
    check(`purchase-submit: ${label} -> invalid_transaction`, errorIs(response, 400, 'invalid_transaction'), brief(response));
  }
  const unsigned = await submit(learnerA.call, intent.body.intent_id, new Uint8Array(Buffer.from(intent.body.transaction_base64, 'base64')));
  check('purchase-submit: the unsigned transaction -> signature_invalid', errorIs(unsigned, 422, 'signature_invalid'), brief(unsigned));
  const tampered = Uint8Array.from(signedTransaction);
  tampered[tampered.length - 1] ^= 1;
  const tamperedAnswer = await submit(learnerA.call, intent.body.intent_id, tampered);
  check('purchase-submit: a message changed after signing -> signature_invalid', errorIs(tamperedAnswer, 422, 'signature_invalid'), brief(tamperedAnswer));
  for (const [detail, signer, overrides] of [
    ['amount', linked, { lamports: BigInt(intent.body.price_lamports) - 1n }],
    ['destination', linked, { recipient: stranger.address }],
    ['memo', linked, { memo: randomUuid() }],
    ['payer', stranger, { payer: stranger.address }],
  ]) {
    const response = await submit(learnerA.call, intent.body.intent_id, signTransaction(signer, rebuilt(overrides)));
    check(`purchase-submit: validly signed, wrong ${detail} -> payment_mismatch (${detail}), nothing broadcast`, errorIs(response, 422, 'payment_mismatch') && response.body.detail === detail, brief(response));
  }
  const foreign = await submit(learnerB.call, intent.body.intent_id, signedTransaction);
  check('purchase-submit: learner B with A\'s intent -> no_wallet (B has none)', errorIs(foreign, 403, 'no_wallet'), brief(foreign));
  const walletForeign = await submit(walletLearner.call, intent.body.intent_id, signedTransaction);
  check('purchase-submit: a wallet learner with A\'s intent -> intent_not_found', errorIs(walletForeign, 404, 'intent_not_found'), brief(walletForeign));
  const staleBlockhash = await submit(learnerA.call, intent.body.intent_id, signTransaction(linked, rebuilt({ recentBlockhash: base58Encode(randomBytes(32)) })));
  check('purchase-submit: a dead blockhash -> broadcast_failed with the node\'s reason', errorIs(staleBlockhash, 422, 'broadcast_failed') && typeof staleBlockhash.body.detail === 'string' && staleBlockhash.body.detail.length <= 200, brief(staleBlockhash));
  check('purchase-submit: the intent is still pending after every refusal', psql(`select status from itera.purchases where id = :'id'::uuid;`, { id: intent.body.intent_id }) === 'pending');

  const treasuryBefore = await balance(treasury);
  const paid = await until(() => submit(learnerA.call, intent.body.intent_id, signedTransaction), (response) => response.body.error !== 'tx_not_found', 5, 1500);
  const signature = base58Encode(signedTransaction.subarray(1, 65));
  check('purchase-submit: the signed transaction is broadcast and the ink is paid', paid.status === 200 && paid.body.status === 'paid' && paid.body.intent_id === intent.body.intent_id && paid.body.item?.key === 'ink_emerald', brief(paid).slice(0, 140));
  check('purchase-submit: explorer_url carries the transaction\'s own signature', paid.body.explorer_url?.includes(signature), paid.body.explorer_url);
  check('purchase-submit: the ink is written on chain (`chain`, `written`, passport, image_url)', paid.body.written?.some((entry) => entry.attribute === 'ink' && entry.value === 'emerald' && entry.asset === pass.asset_address) && typeof paid.body.chain?.tx_signature === 'string' && paid.body.passport?.id === pass.id && typeof paid.body.image_url === 'string', JSON.stringify(paid.body.written));
  const treasuryGain = (await until(() => balance(treasury), (value) => value > treasuryBefore, 10, 1000)) - treasuryBefore;
  // Since the Circuito, half of a paid purchase leaves the treasury for the mint authority (plus that transfer's fee).
  const price = BigInt(intent.body.price_lamports);
  check('purchase-submit: the treasury received exactly the price (less the circuit share once it left)', treasuryGain === price || treasuryGain === price - price / 2n - 5_000n, `${treasuryGain} lamports`);
  verify = await until(() => verifyAsset(pass.asset_address), (response) => attributesOf(response).ink === 'emerald', 20, 1500);
  check('credential-verify: ink = emerald on the certification', attributesOf(verify).ink === 'emerald' && verify.body.owner === linked.address, JSON.stringify(attributesOf(verify)));

  const again = await submit(learnerA.call, intent.body.intent_id, signedTransaction);
  check('purchase-submit: the same transaction again -> the same paid answer, nothing re-applied', again.status === 200 && again.body.status === 'paid' && !('chain' in again.body) && !('written' in again.body), brief(again).slice(0, 120));
  const confirmed = await learnerA.call('purchase-confirm', { intent_id: intent.body.intent_id, signature, lang: 'en' });
  const shape = (body) => Object.keys(body).sort().join(',');
  check('purchase-confirm: same intent and signature -> the same response shape as purchase-submit', confirmed.status === 200 && shape(confirmed.body) === shape(again.body), shape(confirmed.body));
  check('purchases: one paid row holding that signature', psql(`select status || '|' || (applied_at is not null) from itera.purchases where tx_signature = :'signature';`, { signature }) === 'paid|true');

  const violet = await learnerA.call('purchase-intent', { item_key: 'ink_violet', ref_id: trail.unitId });
  const reusedSubmit = await submit(learnerA.call, violet.body.intent_id, signedTransaction);
  check('reused: a paid transaction submitted for another intent -> signature_reused', violet.status === 200 && errorIs(reusedSubmit, 409, 'signature_reused'), brief(reusedSubmit));
  const reusedConfirm = await learnerA.call('purchase-confirm', { intent_id: violet.body.intent_id, signature });
  check('reused: its signature confirmed for another intent -> signature_reused', errorIs(reusedConfirm, 409, 'signature_reused'), brief(reusedConfirm));

  const glasses = await learnerA.call('purchase-intent', { item_key: 'outfit_glasses' });
  const glassesTransaction = signTransaction(linked, new Uint8Array(Buffer.from(glasses.body.transaction_base64, 'base64')).subarray(65));
  const glassesPaid = await until(() => submit(learnerA.call, glasses.body.intent_id, glassesTransaction, base58Encode), (response) => response.body.error !== 'tx_not_found', 5, 1500);
  check('purchase-submit: a base58 transaction buys an outfit (lives + companion in the answer)', glassesPaid.status === 200 && glassesPaid.body.status === 'paid' && glassesPaid.body.inventory?.some((entry) => entry.item_key === 'outfit_glasses') && Boolean(glassesPaid.body.companion), brief(glassesPaid).slice(0, 120));

  // --- the public profile of the linked wallet ------------------------------------------------
  const profile = await publicGet(`learner-profile/${linked.address}?lang=en&t=${Date.now()}`);
  const listed = [...(profile.body?.certifications ?? []), ...(profile.body?.medals ?? [])];
  check('learner-profile: the linked wallet lists its companion, certification and medals, all verified', profile.status === 200 && profile.body.companion?.verified === true && profile.body.companion.asset === companionAsset && profile.body.certifications.length === 1 && profile.body.medals.length >= 1 && listed.every((entry) => entry.verified) && profile.body.verified_count === listed.length + 1, `verified ${profile.body?.verified_count}, medals ${profile.body?.medals?.length}`);
  check('learner-profile: the certification shows the ink bought through purchase-submit', profile.body.certifications[0]?.asset === pass.asset_address && profile.body.certifications[0]?.ink === 'emerald' && profile.body.certifications[0]?.days_done === 2);
  check('learner-profile: no user id and no e-mail in it', !profile.text.includes(learnerA.userId) && !profile.text.includes(EMAIL_DOMAIN));

  // --- the public view of a companion is one snapshot: the chain ------------------------------
  const lost = await learnerA.call('lives', { action: 'lose', attempt_id: `link-e2e-${randomBytes(4).toString('hex')}`, activity_id: day2.activityId });
  const card = await learnerA.call('companion');
  verify = await verifyAsset(companionAsset);
  const publicArt = await fetch(verify.body.achievement?.image_url ?? `${FUNCTIONS}/missing`).then((response) => response.text());
  const drawnLives = publicArt.match(/(\d)\/\d LIVES/)?.[1];
  check('lives: an ordinary mistake moves the database, not the chain', lost.status === 200 && lost.body.lives.current === 4 && !('chain' in lost.body) && card.body.lives.current === 4, JSON.stringify(lost.body.lives));
  check('credential-verify: companion.lives is the on-chain value and its image_url draws the same number', verify.body.companion?.lives === 5 && drawnLives === '5' && verify.body.achievement.image_url.includes('source=chain'), `chain ${verify.body.companion?.lives}, drawn ${drawnLives}, card ${card.body.lives.current}`);
  check('credential-verify: snapshot says chain and when it was last mirrored', verify.body.snapshot?.source === 'chain' && (verify.body.snapshot.mirrored_at === null || !Number.isNaN(Date.parse(verify.body.snapshot.mirrored_at))), JSON.stringify(verify.body.snapshot));
  const liveArt = await fetch(`${card.body.companion.image_url}`).then((response) => response.text());
  check('companion (signed in): the card art keeps the live database value', liveArt.includes('4/5 LIVES') && !card.body.companion.image_url.includes('source=chain'), liveArt.match(/\d\/\d LIVES/)?.[0]);
  const profileAfter = await publicGet(`learner-profile/${linked.address}?lang=en&t=${Date.now()}`);
  const profileArt = await fetch(profileAfter.body.companion?.image_url ?? `${FUNCTIONS}/missing`).then((response) => response.text());
  check('learner-profile: companion.lives, its art and mirrored_at are the same chain snapshot', profileAfter.body.companion?.lives === 5 && profileArt.includes('5/5 LIVES') && profileAfter.body.companion.image_url.includes('source=chain') && 'mirrored_at' in profileAfter.body.companion, `lives ${profileAfter.body.companion?.lives}, mirrored_at ${profileAfter.body.companion?.mirrored_at}`);

  // --- the wallet learner is untouched by all of this -----------------------------------------
  const walletPassport = await walletLearner.call('passport', { lang: 'en' });
  check('wallet account: passport still resolves its sign-in wallet', walletPassport.status === 200 && walletPassport.body.mint?.wallet === walletLearner.wallet.address, JSON.stringify(walletPassport.body.mint));
  check('wallet account: it has no user_wallets row', psql(`select count(*) from itera.user_wallets where user_id = :'user_id'::uuid;`, { user_id: walletLearner.userId }) === '0');

  // --- the protected demo e-mail user: one read ----------------------------------------------
  if (process.env.HACKATHON_DEMO_EMAIL && process.env.HACKATHON_DEMO_PASSWORD) {
    const demo = await token(keys.anon, 'password', { email: process.env.HACKATHON_DEMO_EMAIL, password: process.env.HACKATHON_DEMO_PASSWORD });
    const demoUserId = iteraUserId(demo.user.id);
    const demoStatus = await client(keys.anon, demo.access_token)('link-wallet', { action: 'status' });
    check('demo e-mail user: status -> { wallet: null } (read only)', demoStatus.status === 200 && demoStatus.body.wallet === null && demoStatus.body.source === null, brief(demoStatus));
    const demoRows = psql(
      `select (select count(*) from itera.user_wallets where user_id = :'user_id'::uuid) || '|' ||
              (select count(*) from itera.wallet_link_challenges where user_id = :'user_id'::uuid);`,
      { user_id: demoUserId },
    );
    check('demo e-mail user: no linked wallet and no challenge exists', demoRows === '0|0', demoRows);
  }

  // --- report ---------------------------------------------------------------------------------
  const after = { authority: await balance(authority.address), treasury: await balance(treasury), wallet: await balance(linked.address) };
  console.log(`\nauthority: ${sol(before.authority)} -> ${sol(after.authority)} SOL (${sol(after.authority - before.authority)})`);
  console.log(`treasury:  ${sol(before.treasury)} -> ${sol(after.treasury)} SOL (${sol(after.treasury - before.treasury)})`);
  console.log(`wallet:    ${sol(after.wallet)} SOL left in ${linked.address}`);
  console.log(`certification: https://explorer.solana.com/address/${pass.asset_address}?cluster=devnet`);
  console.log(`companion:     https://explorer.solana.com/address/${companionAsset}?cluster=devnet`);
}

function randomUuid() {
  return crypto.randomUUID();
}

const keys = await projectKeys();
let crashed = null;
try {
  await main(keys);
} catch (error) {
  crashed = error;
  console.error('link-wallet-e2e failed:', error);
}
if (KEEP) for (const user of created) console.log(`kept ${user.label} user ${user.userId}`);
else await removeCreatedUsers(keys);
const failed = results.filter((result) => !result.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 && !crashed ? 0 : 1);
