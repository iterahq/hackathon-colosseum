#!/usr/bin/env node
// End-to-end check of the purchase rail, the companion and lives on Solana devnet,
// against the hackathon project. A throwaway keypair plays the learner's wallet
// (it signs what Phantom would sign).
//
//   node scripts/hackathon/purchase-e2e.mjs
//
// Environment (source ~/.config/itera-hackathon/supabase.env):
//   HACKATHON_DB_PASSWORD, SUPABASE_ACCESS_TOKEN (or HACKATHON_ANON_KEY),
//   HACKATHON_DEMO_EMAIL + HACKATHON_DEMO_PASSWORD (the wallet-less checks),
//   HACKATHON_AUTHORITY_KEYFILE (default ~/.config/itera-hackathon/devnet-authority.json): funds the wallet.
//
// Spends about 0.02 SOL of the authority (wallet funding + one companion mint +
// attribute updates). Leaves one throwaway wallet user behind.
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
const WALLET_TOP_UP = 12_000_000n;
const TREASURY_FLOAT = 100_000_000n;

const results = [];
const timings = new Map();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function check(name, pass, detail = '') {
  results.push({ name, pass: Boolean(pass), detail: String(detail).slice(0, 110) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 110)})` : ''}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sol = (lamports) => (Number(lamports) / 1e9).toFixed(6);

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

/** A keypair that signs like a wallet would. `seed` is the 32-byte private key. */
function keypair(seed) {
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(seed)]), format: 'der', type: 'pkcs8' });
  return { privateKey };
}

function newWallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { privateKey, address: base58Encode(publicKey.export({ type: 'spki', format: 'der' }).subarray(-32)) };
}

function loadAuthority() {
  const file = process.env.HACKATHON_AUTHORITY_KEYFILE ?? `${homedir()}/.config/itera-hackathon/devnet-authority.json`;
  const secret = Uint8Array.from(JSON.parse(readFileSync(file, 'utf8')));
  return { ...keypair(secret.slice(0, 32)), address: base58Encode(secret.slice(32)) };
}

/** Signs a serialized message and submits it, as `signAndSendTransaction` does. Returns the signature. */
async function signAndSend(signer, message) {
  const signature = sign(null, Buffer.from(message), signer.privateKey);
  const sent = await rpc('sendTransaction', [base64Encode(serializeTransaction(message, signature)), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
  if (sent !== base58Encode(signature)) throw new Error('RPC returned another signature');
  return sent;
}

async function transfer(signer, recipient, lamports, memo) {
  const { blockhash } = (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
  const signature = await signAndSend(signer, buildTransferMessage({ payer: signer.address, recipient, lamports, memo, recentBlockhash: blockhash }));
  await waitConfirmed(signature);
  return signature;
}

async function anonKey() {
  if (process.env.HACKATHON_ANON_KEY) return process.env.HACKATHON_ANON_KEY;
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${requireEnv('SUPABASE_ACCESS_TOKEN')}` },
  });
  if (!response.ok) throw new Error(`could not read the project API keys (HTTP ${response.status})`);
  return (await response.json()).find((entry) => entry.name === 'anon').api_key;
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

async function signInWallet(apikey, wallet) {
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
  const signature = sign(null, Buffer.from(message), wallet.privateKey).toString('base64url');
  return token(apikey, 'web3', { chain: 'solana', message, signature });
}

function client(apikey, accessToken) {
  return async (name, { method = 'POST', body = {}, query = '' } = {}) => {
    const startedAt = Date.now();
    const headers = { apikey, 'Content-Type': 'application/json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await fetch(`${FUNCTIONS}/${name}${query}`, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body) });
    const ms = Date.now() - startedAt;
    timings.set(name, [...(timings.get(name) ?? []), ms]);
    return { status: response.status, ms, body: await response.json() };
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
/** `credential-verify` is cached for 20 s per URL: a throwaway query string reads the chain again. */
const verifyAsset = (asset) => publicGet(`credential-verify/${asset}?t=${Date.now()}`);
const verifyUntil = (asset, done) => until(() => verifyAsset(asset), (verify) => done(attributesOf(verify)), 30, 1500);

function iteraUserId(authUserId) {
  return psql(`select user_id from itera.identities where provider_subject = :'subject' limit 1;`, { subject: authUserId });
}

/** The first trail of the program: its unit id and, per day, the lesson and its published activities. */
function loadTrail() {
  const rows = psql(
    `select u.id, l.id, l.ordinal, string_agg(a.id::text, ',' order by a.ordinal, a.id)
     from itera.programs p
     join itera.units u on u.program_id = p.id
     join itera.lessons l on l.unit_id = u.id
     join itera.activities a on a.lesson_id = l.id and a.status = 'published'
     where p.slug = :'program' and u.ordinal = (select min(ordinal) from itera.units where program_id = p.id)
     group by u.id, l.id, l.ordinal order by l.ordinal, l.id;`,
    { program: PROGRAM_SLUG },
  );
  const days = rows.split('\n').map((line) => {
    const [unitId, lessonId, , activities] = line.split('|');
    return { unitId, lessonId, activities: activities.split(',') };
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

/** intent -> the wallet signs the server-built message -> confirm (retried while the transaction propagates). */
async function buy(call, wallet, itemKey, refId) {
  const intent = await call('purchase-intent', { body: refId ? { item_key: itemKey, ref_id: refId } : { item_key: itemKey } });
  if (intent.status !== 200) return { intent, confirm: null, signature: null };
  const signature = await signAndSend(wallet, Buffer.from(intent.body.message_base64, 'base64'));
  const confirm = await until(
    () => call('purchase-confirm', { body: { intent_id: intent.body.intent_id, signature, lang: 'en' } }),
    (response) => response.body.error !== 'tx_not_found',
    6,
    1500,
  );
  return { intent, confirm, signature };
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)];

async function main() {
  const apikey = await anonKey();
  const authority = loadAuthority();
  const treasury = psql(`select value from itera.onchain_config where key = 'treasury';`);
  const before = { authority: await balance(authority.address), treasury: await balance(treasury) };
  console.log(`authority ${authority.address} ${sol(before.authority)} SOL · treasury ${treasury} ${sol(before.treasury)} SOL`);
  if (before.treasury < TREASURY_FLOAT / 2n) {
    await transfer(authority, treasury, TREASURY_FLOAT, 'e2e: treasury float');
    console.log(`treasury float: +${sol(TREASURY_FLOAT)} SOL from the authority`);
  }

  const trail = loadTrail();
  const [day1, day2] = trail.days;

  // --- unauthenticated and malformed requests -------------------------------------------------
  const anonymous = client(apikey, null);
  for (const name of ['purchase-intent', 'purchase-confirm', 'companion', 'lives', 'wallet-faucet']) {
    const response = await anonymous(name);
    check(`${name}: no token -> 401`, response.status === 401 && response.body.error === 'unauthorized', response.status);
  }
  const publicShop = await anonymous('shop-items', { method: 'GET', query: '?lang=en' });
  check('shop-items: public, 7 active items, nothing owned', publicShop.status === 200 && publicShop.body.length === 7 && publicShop.body.every((item) => !item.owned && !item.equipped), publicShop.body.map?.((item) => item.kind).join(','));

  // --- a wallet learner -----------------------------------------------------------------------
  const wallet = newWallet();
  const session = await signInWallet(apikey, wallet);
  const userId = iteraUserId(session.user.id);
  const call = client(apikey, session.access_token);
  console.log(`wallet ${wallet.address} · itera user ${userId}`);

  for (const [name, body] of [
    ['purchase-intent', { item_key: 42 }],
    ['purchase-confirm', { intent_id: 'nope', signature: 'x' }],
    ['companion', { equip: 'crown' }],
    ['lives', { action: 'heal' }],
  ]) {
    const response = await call(name, { body });
    check(`${name}: bad body -> 400 invalid_body`, response.status === 400 && response.body.error === 'invalid_body', response.status);
  }
  const unknownItem = await call('purchase-intent', { body: { item_key: 'trail_pledge' } });
  check('purchase-intent: unknown item -> item_not_found', unknownItem.status === 404 && unknownItem.body.error === 'item_not_found');

  // --- faucet and funding ---------------------------------------------------------------------
  const broke = await call('purchase-intent', { body: { item_key: 'outfit_crown' } });
  check('purchase-intent: empty wallet -> insufficient_funds with the balance', broke.status === 402 && broke.body.error === 'insufficient_funds' && broke.body.balance_lamports === 0, JSON.stringify(broke.body));
  const faucet = await call('wallet-faucet');
  check('wallet-faucet: first call sends 0.01 SOL', faucet.status === 200 && typeof faucet.body.signature === 'string', JSON.stringify(faucet.body));
  const funded = await until(() => balance(wallet.address), (value) => value >= 10_000_000n, 20, 1000);
  check('wallet-faucet: the wallet received it', funded === 10_000_000n, `${sol(funded)} SOL`);
  const faucetAgain = await call('wallet-faucet');
  check('wallet-faucet: second call -> already_claimed', faucetAgain.body.blocked === 'already_claimed', JSON.stringify(faucetAgain.body));
  await transfer(authority, wallet.address, WALLET_TOP_UP, 'e2e: wallet top-up');

  // --- companion: lazy row, background mint, public verification ------------------------------
  const first = await call('companion');
  check('companion: first call answers fast with lives 5/5 and a pending mint', first.status === 200 && first.body.lives.current === 5 && first.body.lives.max === 5 && first.body.companion.mint_status === 'pending' && first.body.wallet === wallet.address, `${first.ms} ms, ${first.body.companion?.mint_status}`);
  const minted = await until(() => call('companion'), (response) => response.body.companion?.mint_status !== 'pending', 60, 2000);
  const companion = minted.body.companion;
  check('companion: minted on devnet', companion.mint_status === 'minted' && Boolean(companion.asset_address), companion.asset_address ?? JSON.stringify(companion));
  let verify = await verifyAsset(companion.asset_address);
  let attributes = attributesOf(verify);
  check('companion asset: verified, soulbound, owned by the wallet', verify.body.verified === true && verify.body.frozen === true && verify.body.owner === wallet.address && verify.body.checks.collection_is_ours);
  check('companion asset: attributes mirror the database', attributes.kind === 'companion' && attributes.lives === '5' && attributes.max_lives === '5' && attributes.outfit === 'none' && attributes.level === '1' && attributes.learner === userId, JSON.stringify(attributes));
  check('credential-verify: achievement.key = companion, no user id in it', verify.body.achievement?.key === 'companion' && !JSON.stringify(verify.body.achievement).includes(userId));
  const companionMeta = await publicGet(`credential-meta/companion/${companion.id}`);
  const bareArt = (await publicGet(`credential-meta/companion/${companion.id}/image.svg`)).text;
  check('credential-meta: companion metadata and art', companionMeta.status === 200 && companionMeta.body.name === 'Tera companion' && bareArt.startsWith('<svg') && bareArt.includes('5/5 LIVES'));

  // --- lives ----------------------------------------------------------------------------------
  const run = randomBytes(4).toString('hex');
  let lives;
  for (let index = 0; index < 5; index += 1) {
    lives = await call('lives', { body: { action: 'lose', attempt_id: `e2e-${run}-${index}`, activity_id: day2.activities[0] } });
  }
  check('lives: five wrong answers with distinct attempt ids -> 0', lives.body.lives.current === 0 && lives.body.lives.regen_seconds > 1100 && lives.body.lives.next_regen_at !== null, JSON.stringify(lives.body.lives));
  const replay = await call('lives', { body: { action: 'lose', attempt_id: `e2e-${run}-0`, activity_id: day2.activities[0] } });
  const floor = await call('lives', { body: { action: 'lose', attempt_id: `e2e-${run}-floor`, activity_id: day2.activities[0] } });
  check('lives: a replayed attempt id changes nothing, and lives never go below 0', replay.body.lives.current === 0 && floor.body.lives.current === 0);
  const loseEvents = psql(`select count(*) from itera.life_events where user_id = :'user_id'::uuid and kind = 'lose';`, { user_id: userId });
  check('lives: one event per attempt id', loseEvents === '6', loseEvents);
  verify = await verifyAsset(companion.asset_address);
  check('lives: mistakes are not written on chain', attributesOf(verify).lives === '5', attributesOf(verify).lives);

  // --- life_refill: pay, confirm, idempotency, reuse ------------------------------------------
  const treasuryBeforeRefill = await balance(treasury);
  const refill = await buy(call, wallet, 'life_refill');
  check('purchase-intent: flat contract fields', ['intent_id', 'message_base58', 'transaction_base58', 'transaction_base64', 'price_lamports', 'price_usd_cents', 'price_label', 'last_valid_block_height', 'expires_at', 'treasury', 'memo', 'cluster'].every((field) => field in (refill.intent.body ?? {})) && refill.intent.body.memo === refill.intent.body.intent_id && refill.intent.body.price_lamports === 550000, JSON.stringify(Object.keys(refill.intent.body ?? {})));
  check('life_refill: confirm -> paid, lives 5/5', refill.confirm?.status === 200 && refill.confirm.body.status === 'paid' && refill.confirm.body.lives?.current === 5 && refill.confirm.body.item.key === 'life_refill', JSON.stringify(refill.confirm?.body).slice(0, 200));
  check('life_refill: the treasury received exactly the price', (await balance(treasury)) - treasuryBeforeRefill === 550_000n);
  verify = await verifyUntil(companion.asset_address, (current) => current.lives === '5');
  check('life_refill: attribute lives = 5 on chain', attributesOf(verify).lives === '5');
  const refillAgain = await call('purchase-confirm', { body: { intent_id: refill.intent.body.intent_id, signature: refill.signature, lang: 'en' } });
  check('purchase-confirm: same intent + signature twice -> same paid result', refillAgain.status === 200 && refillAgain.body.status === 'paid' && refillAgain.body.lives.current === 5 && refillAgain.body.explorer_url === refill.confirm.body.explorer_url);
  const notNeeded = await call('purchase-intent', { body: { item_key: 'life_refill' } });
  check('life_refill: at full lives -> not_needed', notNeeded.status === 409 && notNeeded.body.error === 'not_needed', JSON.stringify(notNeeded.body));
  const crownIntent = await call('purchase-intent', { body: { item_key: 'outfit_crown' } });
  const crownIntentAgain = await call('purchase-intent', { body: { item_key: 'outfit_crown' } });
  check('purchase-intent: a pending intent is reused, not piled', crownIntent.status === 200 && crownIntentAgain.body.intent_id === crownIntent.body.intent_id);
  const reused = await call('purchase-confirm', { body: { intent_id: crownIntent.body.intent_id, signature: refill.signature } });
  check('purchase-confirm: a recorded signature on another intent -> signature_reused', reused.status === 409 && reused.body.error === 'signature_reused', JSON.stringify(reused.body));

  // --- tampered payments (on the still-open crown intent) -------------------------------------
  const { blockhash } = (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
  const forge = (patch) => buildTransferMessage({ payer: wallet.address, recipient: treasury, lamports: BigInt(crownIntent.body.price_lamports), memo: crownIntent.body.memo, recentBlockhash: blockhash, ...patch });
  const confirmForged = async (message) => {
    const signature = await signAndSend(wallet, message);
    await waitConfirmed(signature);
    return until(() => call('purchase-confirm', { body: { intent_id: crownIntent.body.intent_id, signature } }), (response) => response.body.error !== 'tx_not_found', 6, 1500);
  };
  const short = await confirmForged(forge({ lamports: BigInt(crownIntent.body.price_lamports) - 1n }));
  check('tampered: one lamport less -> payment_mismatch (amount)', short.status === 422 && short.body.error === 'payment_mismatch' && short.body.detail === 'amount', JSON.stringify(short.body));
  const elsewhere = await confirmForged(forge({ recipient: authority.address }));
  check('tampered: another destination -> payment_mismatch (destination)', elsewhere.status === 422 && elsewhere.body.detail === 'destination', JSON.stringify(elsewhere.body));
  const otherMemo = await confirmForged(forge({ memo: refill.intent.body.memo }));
  check('tampered: another intent`s memo -> payment_mismatch (memo)', otherMemo.body.error === 'payment_mismatch' && otherMemo.body.detail === 'memo', JSON.stringify(otherMemo.body));
  const stranger = newWallet();
  const strangerSession = await signInWallet(apikey, stranger);
  const foreign = await client(apikey, strangerSession.access_token)('purchase-confirm', { body: { intent_id: crownIntent.body.intent_id, signature: refill.signature } });
  check('purchase-confirm: another learner`s intent -> intent_not_found', foreign.status === 404 && foreign.body.error === 'intent_not_found', JSON.stringify(foreign.body));

  // --- outfit: buy, own, equip ----------------------------------------------------------------
  const crown = await buy(call, wallet, 'outfit_crown');
  check('outfit_crown: the tampered intent is still payable; confirm -> owned, not equipped', crown.confirm?.status === 200 && crown.intent.body.intent_id === crownIntent.body.intent_id && crown.confirm.body.inventory.some((entry) => entry.item_key === 'outfit_crown' && entry.kind === 'outfit' && entry.equipped === false) && crown.confirm.body.companion?.outfit === null, JSON.stringify(crown.confirm?.body).slice(0, 200));
  const owned = await call('purchase-intent', { body: { item_key: 'outfit_crown' } });
  check('outfit_crown: second purchase -> already_owned', owned.status === 409 && owned.body.error === 'already_owned');
  const notOwned = await call('companion', { body: { equip: { outfit: 'outfit_glasses' } } });
  check('companion: equipping an outfit that is not owned -> not_owned', notOwned.status === 409 && notOwned.body.error === 'not_owned');
  const equipped = await call('companion', { body: { equip: { outfit: 'outfit_crown' } } });
  check('companion: equip the crown', equipped.status === 200 && equipped.body.companion.outfit === 'outfit_crown' && equipped.body.inventory.some((entry) => entry.item_key === 'outfit_crown' && entry.equipped));
  verify = await verifyUntil(companion.asset_address, (current) => current.outfit === 'outfit_crown');
  check('companion: attribute outfit = outfit_crown on chain', attributesOf(verify).outfit === 'outfit_crown', attributesOf(verify).outfit);
  // The art is cached for a minute per URL; `image_url` carries a version for that reason.
  const crownArt = (await publicGet(equipped.body.companion.image_url.replace(`${FUNCTIONS}/`, ''))).text;
  check('companion art: differs once the crown is on', crownArt !== bareArt && crownArt.includes('data-outfit="outfit_crown"'));
  const shop = await call('shop-items', { method: 'GET', query: '?lang=en' });
  const shopCrown = shop.body.find?.((item) => item.key === 'outfit_crown');
  check('shop-items: with a token -> crown owned and equipped, the rest not', shopCrown?.owned === true && shopCrown.equipped === true && shop.body.filter((item) => item.owned).length === 1);

  // --- lesson_end -----------------------------------------------------------------------------
  const early = await call('lives', { body: { action: 'lesson_end', lesson_id: day1.lessonId, mistakes: 0 } });
  check('lesson_end: an unfinished lesson gives nothing', early.body.bonus === 'lesson_incomplete' && early.body.lives.current === 5, early.body.bonus);
  const inkEarly = await call('purchase-intent', { body: { item_key: 'ink_emerald', ref_id: trail.unitId } });
  check('ink_emerald: without a minted passport -> passport_required', inkEarly.status === 409 && inkEarly.body.error === 'passport_required', JSON.stringify(inkEarly.body));
  completeLessons(userId, [day1.lessonId]);
  const full = await call('lives', { body: { action: 'lesson_end', lesson_id: day1.lessonId, mistakes: 0 } });
  check('lesson_end: 0 mistakes at full lives -> no bonus', full.body.bonus === 'full' && full.body.lives.current === 5, full.body.bonus);
  await call('lives', { body: { action: 'lose', attempt_id: `e2e-${run}-late`, activity_id: day2.activities[0] } });
  const sloppy = await call('lives', { body: { action: 'lesson_end', lesson_id: day1.lessonId, mistakes: 2 } });
  check('lesson_end: with mistakes -> no bonus', sloppy.body.bonus === 'mistakes' && sloppy.body.lives.current === 4, sloppy.body.bonus);
  const bonus = await call('lives', { body: { action: 'lesson_end', lesson_id: day1.lessonId, mistakes: 0 } });
  check('lesson_end: 0 mistakes below max -> +1', bonus.body.bonus === 'granted' && bonus.body.lives.current === 5, `${bonus.body.bonus} ${bonus.body.lives.current}`);
  await call('lives', { body: { action: 'lose', attempt_id: `e2e-${run}-later`, activity_id: day2.activities[0] } });
  const bonusAgain = await call('lives', { body: { action: 'lesson_end', lesson_id: day1.lessonId, mistakes: 0 } });
  check('lesson_end: the same lesson on the same day only once', bonusAgain.body.bonus === 'already_granted' && bonusAgain.body.lives.current === 4, `${bonusAgain.body.bonus} ${bonusAgain.body.lives.current}`);
  verify = await verifyUntil(companion.asset_address, (current) => current.lives === '4');
  check('lesson_end: lives mirrored on chain', attributesOf(verify).lives === '4', attributesOf(verify).lives);

  // --- passport cosmetics ---------------------------------------------------------------------
  const passportCall = await until(() => call('passport', { body: { lang: 'en' } }), (response) => response.status !== 200 || response.body.remaining === 0, 5, 1000);
  const pass = [...(passportCall.body.awards ?? []), ...(passportCall.body.updated ?? [])].find((award) => award.key === 'trail_pass');
  const passRow = psql(`select id || '|' || coalesce(asset_address, '') from itera.user_achievements where user_id = :'user_id'::uuid and achievement_key = 'trail_pass';`, { user_id: userId }).split('|');
  const [passId, passAsset] = passRow;
  check('passport: day 1 mints the passport (function untouched by purchases)', Boolean(passAsset) && (!pass || pass.mint_status === 'minted'), passAsset);
  const artUrl = `credential-meta/${passId}/image.svg`;
  const plainArt = (await publicGet(artUrl)).text;

  const emerald = await buy(call, wallet, 'ink_emerald', trail.unitId);
  check('ink_emerald: confirm -> passport item with the cosmetic and a refreshed image_url', emerald.confirm?.status === 200 && emerald.confirm.body.passport?.key === 'trail_pass' && emerald.confirm.body.passport.state.cosmetics?.ink === 'emerald' && emerald.confirm.body.image_url?.includes(passId), JSON.stringify(emerald.confirm?.body).slice(0, 200));
  verify = await verifyAsset(passAsset);
  check('ink_emerald: attribute ink = emerald on chain, the others kept', attributesOf(verify).ink === 'emerald' && attributesOf(verify).days_done === '1' && attributesOf(verify).kind === 'trail_passport', JSON.stringify(attributesOf(verify)));
  const emeraldArt = (await publicGet(emerald.confirm.body.image_url.replace(`${FUNCTIONS}/`, ''))).text;
  check('ink_emerald: the art changed and uses the ink', emeraldArt !== plainArt && emeraldArt.includes('#34D399') && !plainArt.includes('#34D399'));
  const emeraldMeta = await publicGet(`credential-meta/${passId}`);
  check('credential-meta: attributes gain Ink', emeraldMeta.body.attributes.some((entry) => entry.trait_type === 'Ink' && entry.value === 'emerald') && !emeraldMeta.body.attributes.some((entry) => entry.trait_type === 'Frame'));

  const frame = await buy(call, wallet, 'frame_gold_leaf', trail.unitId);
  verify = await verifyAsset(passAsset);
  check('frame_gold_leaf: ink and frame both on chain', frame.confirm?.status === 200 && attributesOf(verify).ink === 'emerald' && attributesOf(verify).frame === 'gold-leaf', JSON.stringify(attributesOf(verify)));

  const violet = await buy(call, wallet, 'ink_violet', trail.unitId);
  verify = await verifyAsset(passAsset);
  check('ink_violet: replaces the ink, keeps the frame', violet.confirm?.status === 200 && attributesOf(verify).ink === 'violet' && attributesOf(verify).frame === 'gold-leaf' && violet.confirm.body.inventory.filter((entry) => entry.ref_id === trail.unitId).length === 3, JSON.stringify(attributesOf(verify)));
  const inkAgain = await call('purchase-intent', { body: { item_key: 'ink_violet', ref_id: trail.unitId } });
  check('ink_violet: second purchase for the same trail -> already_owned', inkAgain.body.error === 'already_owned');

  completeLessons(userId, trail.days.slice(1).map((day) => day.lessonId));
  const gold = await until(() => call('passport', { body: { lang: 'en' } }), (response) => response.status !== 200 || response.body.remaining === 0, 6, 1000);
  verify = await verifyUntil(passAsset, (current) => current.tier === 'gold');
  attributes = attributesOf(verify);
  check('passport: days 2-5 stamp to gold and the cosmetics survive the stamp update', gold.status === 200 && attributes.tier === 'gold' && attributes.days_done === String(trail.days.length) && attributes.ink === 'violet' && attributes.frame === 'gold-leaf', JSON.stringify(attributes));
  const goldArt = (await publicGet(`${artUrl}?v=gold`)).text;
  check('passport art: gold page still wears ink and frame', goldArt.includes('CERTIFIED') && goldArt.includes('#A78BFA') && goldArt.includes('data-frame="gold-leaf"'));

  // --- expired intents ------------------------------------------------------------------------
  const glasses = await call('purchase-intent', { body: { item_key: 'outfit_glasses' } });
  const unseen = base58Encode(randomBytes(64));
  psql(`update itera.purchases set last_valid_block_height = 1 where id = :'id'::uuid;`, { id: glasses.body.intent_id });
  const dead = await call('purchase-confirm', { body: { intent_id: glasses.body.intent_id, signature: unseen } });
  check('expired: unseen signature past the last valid block -> intent_expired', dead.status === 410 && dead.body.error === 'intent_expired', JSON.stringify(dead.body));
  const headphones = await call('purchase-intent', { body: { item_key: 'outfit_headphones' } });
  const pendingTx = await call('purchase-confirm', { body: { intent_id: headphones.body.intent_id, signature: unseen } });
  check('not yet visible: unseen signature inside the window -> tx_not_found (retryable)', pendingTx.status === 404 && pendingTx.body.error === 'tx_not_found' && pendingTx.body.retryable === true, JSON.stringify(pendingTx.body));
  psql(`update itera.purchases set expires_at = now() - interval '2 days' where id = :'id'::uuid;`, { id: headphones.body.intent_id });
  const stale = await call('purchase-confirm', { body: { intent_id: headphones.body.intent_id, signature: unseen } });
  check('expired: beyond the grace window -> intent_expired', stale.status === 410 && stale.body.error === 'intent_expired', JSON.stringify(stale.body));

  // --- a learner without a wallet (the demo email user) ---------------------------------------
  if (process.env.HACKATHON_DEMO_EMAIL && process.env.HACKATHON_DEMO_PASSWORD) {
    const demo = await token(apikey, 'password', { email: process.env.HACKATHON_DEMO_EMAIL, password: process.env.HACKATHON_DEMO_PASSWORD });
    const demoUserId = iteraUserId(demo.user.id);
    const demoCall = client(apikey, demo.access_token);
    try {
      const demoCompanion = await demoCall('companion');
      check('email user: companion works off chain (no asset, no wallet)', demoCompanion.status === 200 && demoCompanion.body.wallet === null && demoCompanion.body.companion.asset_address === null && demoCompanion.body.companion.mint_status === 'unclaimed' && demoCompanion.body.companion.xp > 0, JSON.stringify(demoCompanion.body.companion));
      const demoLives = await demoCall('lives', { body: { action: 'lose', attempt_id: `e2e-${run}-demo`, activity_id: day1.activities[0] } });
      check('email user: lives work off chain', demoLives.status === 200 && demoLives.body.lives.current === demoCompanion.body.lives.current - 1, JSON.stringify(demoLives.body.lives));
      const demoIntent = await demoCall('purchase-intent', { body: { item_key: 'life_refill' } });
      check('email user: purchase-intent -> no_wallet', demoIntent.status === 403 && demoIntent.body.error === 'no_wallet');
      const demoFaucet = await demoCall('wallet-faucet');
      check('email user: wallet-faucet -> blocked no_wallet', demoFaucet.body.blocked === 'no_wallet');
    } finally {
      psql(
        `update itera.companions set lives = max_lives, last_regen_at = now() where user_id = :'user_id'::uuid;
         delete from itera.life_events where user_id = :'user_id'::uuid and attempt_id like 'lose:e2e-%';`,
        { user_id: demoUserId },
      );
    }
    const restored = psql(`select lives || '/' || max_lives from itera.companions where user_id = :'user_id'::uuid;`, { user_id: demoUserId });
    check('email user: lives restored to max after the test', restored === '5/5', restored);
  }

  // --- report ---------------------------------------------------------------------------------
  const after = { authority: await balance(authority.address), treasury: await balance(treasury), wallet: await balance(wallet.address) };
  console.log('\n| check | result |\n|---|---|');
  for (const { name, pass } of results) console.log(`| ${name} | ${pass ? 'pass' : 'FAIL'} |`);
  console.log('\n| function | calls | median ms | max ms |\n|---|---|---|---|');
  for (const [name, values] of [...timings].sort()) console.log(`| ${name} | ${values.length} | ${median(values)} | ${Math.max(...values)} |`);
  console.log(`\nauthority: ${sol(before.authority)} -> ${sol(after.authority)} SOL (${sol(after.authority - before.authority)})`);
  console.log(`treasury:  ${sol(before.treasury)} -> ${sol(after.treasury)} SOL (${sol(after.treasury - before.treasury)})`);
  console.log(`wallet:    ${sol(after.wallet)} SOL left in ${wallet.address}`);
  console.log(`companion: https://explorer.solana.com/address/${companion.asset_address}?cluster=devnet`);
  console.log(`passport:  https://explorer.solana.com/address/${passAsset}?cluster=devnet`);
  const failed = results.filter((result) => !result.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('purchase-e2e failed:', error);
  process.exit(1);
});
