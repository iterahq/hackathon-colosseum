#!/usr/bin/env node
// End-to-end check of "gift a life" (in-app purchase rail + Solana Action / blink) and of the
// invite reward, on Solana devnet against the hackathon project. Throwaway keypairs play the
// wallets; this script is also the blink client (GET -> POST -> sign -> send -> POST callback).
//
//   node scripts/hackathon/gift-e2e.mjs
//
// Environment (source ~/.config/itera-hackathon/supabase.env): HACKATHON_DB_PASSWORD,
// SUPABASE_ACCESS_TOKEN (or HACKATHON_ANON_KEY), HACKATHON_AUTHORITY_KEYFILE (default
// ~/.config/itera-hackathon/devnet-authority.json): funds the two paying wallets.
//
// Spends about 0.03 SOL of the authority (funding, two companions, one certification, four
// medals, attribute updates). Leaves four throwaway wallet users behind. Never touches the
// owner's wallet account or the demo e-mail user.
import { execFileSync } from 'node:child_process';
import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { base58Encode, base64Encode, buildTransferMessage, serializeTransaction } from '../../supabase/functions/_shared/solana-tx.ts';

const PROJECT_REF = 'nyzcbnnbffsizshiolbh';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const FUNCTIONS = `${SUPABASE_URL}/functions/v1`;
const DB_URL = `postgresql://postgres.${PROJECT_REF}@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require`;
const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const SIWS_HOST = 'hackathon.iterahq.dev';
const PROGRAM_SLUG = 'itera-v2';
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const CHAIN_ID = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const GIFT_LAMPORTS = 550_000n;
const PROTECTED_WALLET = 'CQziGuEV4i8yGBHwQQJMpe6tACSMR5jWUWjmYSGVDAhW';
/** Longer than the server's "this gift may still be confirming" window (15 s). */
const RECONCILE_WAIT_MS = 17_000;

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 140)})` : ''}`);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sol = (lamports) => (Number(lamports) / 1e9).toFixed(6);
function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function psql(sql, variables = {}) {
  const args = [DB_URL, '-X', '-At', '-v', 'ON_ERROR_STOP=1'];
  for (const [name, value] of Object.entries(variables)) args.push('-v', `${name}=${value}`);
  return execFileSync('psql', args, { input: sql, encoding: 'utf8', env: { ...process.env, PGPASSWORD: requireEnv('HACKATHON_DB_PASSWORD') } }).trim();
}

async function rpc(method, params) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(RPC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
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

/** Signs a serialized legacy message and submits it, as a wallet's `signAndSendTransaction` does. */
async function signAndSend(signer, message) {
  const signature = sign(null, Buffer.from(message), signer.privateKey);
  const sent = await rpc('sendTransaction', [base64Encode(serializeTransaction(message, signature)), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
  await waitConfirmed(sent);
  return sent;
}

async function fund(authority, recipient, lamports) {
  const { blockhash } = (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
  return signAndSend(authority, buildTransferMessage({ payer: authority.address, recipient, lamports, memo: 'gift-e2e: funding', recentBlockhash: blockhash }));
}

async function anonKey() {
  if (process.env.HACKATHON_ANON_KEY) return process.env.HACKATHON_ANON_KEY;
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${requireEnv('SUPABASE_ACCESS_TOKEN')}` } });
  if (!response.ok) throw new Error(`could not read the project API keys (HTTP ${response.status})`);
  return (await response.json()).find((entry) => entry.name === 'anon').api_key;
}

/** A throwaway wallet learner: signed in with Solana, with a client for the edge functions and one for PostgREST. */
async function newLearner(apikey, label) {
  const wallet = newWallet();
  if (wallet.address === PROTECTED_WALLET) throw new Error('refusing the protected wallet');
  const message = [`${SIWS_HOST} wants you to sign in with your Solana account:`, wallet.address, '', 'Sign in to Itera Hackathon', '', `URI: https://${SIWS_HOST}/login`, 'Version: 1', `Issued At: ${new Date().toISOString()}`].join('\n');
  const signature = sign(null, Buffer.from(message), wallet.privateKey).toString('base64url');
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=web3`, { method: 'POST', headers: { apikey, 'Content-Type': 'application/json' }, body: JSON.stringify({ chain: 'solana', message, signature }) });
  const session = await response.json();
  if (!response.ok || !session.access_token) throw new Error(`sign-in failed: HTTP ${response.status}`);
  const userId = psql(`select user_id from itera.identities where provider_subject = :'subject' limit 1;`, { subject: session.user.id });
  const headers = { apikey, 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` };
  const call = async (name, body = {}) => {
    const answer = await fetch(`${FUNCTIONS}/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: answer.status, body: await answer.json() };
  };
  const rest = async (table) => (await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, { headers: { ...headers, 'Accept-Profile': 'itera' } })).json();
  console.log(`${label}: wallet ${wallet.address} · itera user ${userId}`);
  return { ...wallet, userId, call, rest };
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

/** The companion asset's attributes as the chain holds them (`credential-verify` is cached per URL). */
async function chainLives(asset, wanted) {
  const read = async () => {
    const body = await (await fetch(`${FUNCTIONS}/credential-verify/${asset}?t=${Date.now()}`)).json();
    return Number((body.attributes ?? []).find(({ key }) => key === 'lives')?.value);
  };
  return until(read, (lives) => lives === wanted, 30, 1500);
}

const dbLives = (userId) => Number(psql(`select lives from itera.companions where user_id = :'user_id'::uuid;`, { user_id: userId }));
const setLives = (userId, lives) =>
  psql(`update itera.companions set lives = :lives, last_regen_at = now(), version = version + 1 where user_id = :'user_id'::uuid;`, { user_id: userId, lives });
const giftRow = (id) => psql(`select status || '|' || coalesce(tx_signature, '') || '|' || coalesce(mirror_signature, '') || '|' || source from itera.gifts where id = :'id'::uuid;`, { id }).split('|');

/** In-app path: intent with a recipient -> the wallet signs the server-built message -> confirm. */
async function giftInApp(payer, recipientWallet, { confirm = true } = {}) {
  const intent = await payer.call('purchase-intent', { item_key: 'life_gift', recipient: recipientWallet });
  if (intent.status !== 200) return { intent, confirmed: null, signature: null };
  const signature = await signAndSend(payer, Buffer.from(intent.body.message_base64, 'base64'));
  if (!confirm) return { intent, confirmed: null, signature };
  const confirmed = await until(() => payer.call('purchase-confirm', { intent_id: intent.body.intent_id, signature, lang: 'en' }), (answer) => answer.body.error !== 'tx_not_found', 6, 1500);
  return { intent, confirmed, signature };
}

const actionUrl = (wallet) => `${FUNCTIONS}/action-gift?to=${wallet}`;
async function action(url, { method = 'GET', body } = {}) {
  const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, headers: response.headers, body: method === 'OPTIONS' ? null : await response.json() };
}

/** The headers the Actions specification requires on GET, POST and OPTIONS answers. */
function specHeaders(headers) {
  const allowed = (headers.get('access-control-allow-headers') ?? '').toLowerCase();
  const methods = headers.get('access-control-allow-methods') ?? '';
  return (
    headers.get('access-control-allow-origin') === '*' &&
    ['GET', 'POST', 'OPTIONS'].every((method) => methods.includes(method)) &&
    ['content-type', 'authorization', 'content-encoding', 'accept-encoding', 'x-action-version', 'x-blockchain-ids'].every((name) => allowed.includes(name)) &&
    /^\d+\.\d+/.test(headers.get('x-action-version') ?? '') &&
    headers.get('x-blockchain-ids') === CHAIN_ID
  );
}
const isHttps = (value) => typeof value === 'string' && /^https:\/\/\S+$/.test(value);
const isText = (value) => typeof value === 'string' && value.length > 0;
/** `ActionGetResponse` of the specification. */
const isActionGet = (body) =>
  body?.type === 'action' && isHttps(body.icon) && isText(body.title) && isText(body.description) && isText(body.label) &&
  Array.isArray(body.links?.actions) && body.links.actions.length > 0 &&
  body.links.actions.every((entry) => entry.type === 'transaction' && isHttps(entry.href) && isText(entry.label));
/** `ActionPostResponse` (a transaction) chained to a POST callback. */
const isActionPost = (body) =>
  body?.type === 'transaction' && isText(body.transaction) && Buffer.from(body.transaction, 'base64').toString('base64') === body.transaction &&
  isText(body.message) && body.links?.next?.type === 'post' && isHttps(body.links.next.href);
/** `CompletedAction`: nothing left to sign. */
const isCompleted = (body) => body?.type === 'completed' && isHttps(body.icon) && isText(body.title) && isText(body.description) && isText(body.label) && !('links' in body);
const isActionError = (body) => isText(body?.message);

/** The blink client's part: POST the account, check the transaction it gets, sign and send it. */
async function blinkPay(payer, recipientWallet, treasury) {
  const post = await action(actionUrl(recipientWallet), { method: 'POST', body: { account: payer.address } });
  if (post.status !== 200) return { post };
  const bytes = Buffer.from(post.body.transaction, 'base64');
  const message = bytes.subarray(65);
  const giftId = new URL(post.body.links.next.href).searchParams.get('gift');
  const blockhash = base58Encode(message.subarray(3 + 1 + 32 * 4, 3 + 1 + 32 * 5));
  const expected = buildTransferMessage({ payer: payer.address, recipient: treasury, lamports: GIFT_LAMPORTS, memo: giftId, recentBlockhash: blockhash });
  const exact = bytes[0] === 1 && bytes.subarray(1, 65).every((byte) => byte === 0) && Buffer.compare(message, Buffer.from(expected)) === 0;
  const signature = await signAndSend(payer, message);
  return { post, giftId, signature, exact };
}

async function passportUntilSettled(learner) {
  const first = await learner.call('passport', { lang: 'en' });
  let last = first;
  for (let round = 0; round < 4 && last.status === 200 && last.body.remaining > 0; round += 1) last = await learner.call('passport', { lang: 'en' });
  return first;
}

async function main() {
  const apikey = await anonKey();
  const authority = loadAuthority();
  const treasury = psql(`select value from itera.onchain_config where key = 'treasury';`);
  const before = { authority: await balance(authority.address), treasury: await balance(treasury) };
  console.log(`authority ${authority.address} ${sol(before.authority)} SOL · treasury ${treasury} ${sol(before.treasury)} SOL`);

  const inviter = await newLearner(apikey, 'A (inviter, recipient)');
  const invited = await newLearner(apikey, 'B (invited, in-app payer)');
  const old = await newLearner(apikey, 'E (aged account)');
  const stranger = newWallet();
  console.log(`C (blink payer, not a learner): wallet ${stranger.address}`);
  await fund(authority, invited.address, 5_000_000n);
  await fund(authority, stranger.address, 3_500_000n);

  for (const learner of [inviter, invited]) await learner.call('companion');
  const minted = async (learner) => (await until(() => learner.call('companion'), (answer) => answer.body.companion?.mint_status === 'minted', 30, 2000)).body;
  const [inviterCompanion, invitedCompanion] = [await minted(inviter), await minted(invited)];
  check('companions of A and B are minted', inviterCompanion.companion.asset_address && invitedCompanion.companion.asset_address);
  check('lives answer carries `bonus: 0` at 5/5', inviterCompanion.lives.current === 5 && inviterCompanion.lives.bonus === 0, JSON.stringify(inviterCompanion.lives));
  const inviterAsset = inviterCompanion.companion.asset_address;
  const invitedAsset = invitedCompanion.companion.asset_address;

  // --- referral: claim ------------------------------------------------------------------------
  const anonymous = await fetch(`${FUNCTIONS}/referral`, { method: 'POST', headers: { apikey, 'Content-Type': 'application/json' }, body: '{"action":"status"}' });
  check('referral: no token -> 401', anonymous.status === 401);
  check('referral: bad action -> 400 invalid_body', (await inviter.call('referral', { action: 'pay' })).status === 400);
  const status0 = await inviter.call('referral', { action: 'status' });
  const code = status0.body.code;
  check('referral status: a short stable code and a link, nobody invited', /^[a-z0-9]{6,12}$/.test(code) && status0.body.link.endsWith(`/?ref=${code}`) && status0.body.invited.length === 0 && !inviter.address.toLowerCase().includes(code), JSON.stringify(status0.body));
  check('referral status: the code is stable', (await inviter.call('referral', { action: 'status' })).body.code === code);

  psql(`update itera.users set created_at = now() - interval '20 minutes' where id = :'user_id'::uuid;`, { user_id: old.userId });
  const refusals = [
    ['self-referral', await inviter.call('referral', { action: 'claim', code }), 'self_referral'],
    ['unknown code', await invited.call('referral', { action: 'claim', code: 'zzzzzzzz' }), 'unknown_code'],
    ['malformed code', await invited.call('referral', { action: 'claim', code: 42 }), 'unknown_code'],
    ['account older than 10 minutes', await old.call('referral', { action: 'claim', code }), 'account_too_old'],
  ];
  for (const [name, answer, reason] of refusals) check(`referral claim: ${name} -> ignored (${reason})`, answer.status === 200 && answer.body.claimed === false && answer.body.reason === reason, JSON.stringify(answer.body));
  const claim = await invited.call('referral', { action: 'claim', code });
  check('referral claim: a new account arriving by the code -> claimed', claim.status === 200 && claim.body.claimed === true, JSON.stringify(claim.body));
  const again = await invited.call('referral', { action: 'claim', code });
  check('referral claim: a second claim -> ignored (already_claimed)', again.body.claimed === false && again.body.reason === 'already_claimed');
  const status1 = await inviter.call('referral', { action: 'status' });
  check('referral status: one pending invite, no identity of the invited learner', status1.body.invited.length === 1 && status1.body.invited[0].status === 'pending' && status1.body.rewarded_count === 0 && !JSON.stringify(status1.body).includes(invited.userId) && !JSON.stringify(status1.body).includes(invited.address), JSON.stringify(status1.body));
  check('referral: exactly one row in the database', psql(`select count(*) from itera.referrals where inviter_user_id = :'user_id'::uuid;`, { user_id: inviter.userId }) === '1');

  // --- referral: reward on the first stamp ----------------------------------------------------
  const early = await invited.call('passport', { lang: 'en' });
  check('referral: no reward before the first day', early.status === 200 && early.body.awards.length === 0 && dbLives(inviter.userId) === 5 && psql(`select status from itera.referrals where invited_user_id = :'user_id'::uuid;`, { user_id: invited.userId }) === 'pending');

  const firstLesson = psql(
    `select l.id from itera.programs p join itera.units u on u.program_id = p.id join itera.lessons l on l.unit_id = u.id
     where p.slug = :'program' and exists (select 1 from itera.activities a where a.lesson_id = l.id and a.status = 'published')
     order by u.ordinal, l.ordinal, l.id limit 1;`,
    { program: PROGRAM_SLUG },
  );
  psql(
    `insert into itera.progress (user_id, activity_id, status, completed_at)
     select :'user_id'::uuid, a.id, 'completed', now() from itera.activities a where a.status = 'published' and a.lesson_id = :'lesson'::uuid
     on conflict (user_id, activity_id) do update set status = 'completed', completed_at = excluded.completed_at;`,
    { user_id: invited.userId, lesson: firstLesson },
  );
  const stamped = await passportUntilSettled(invited);
  const keys = (stamped.body.awards ?? []).map((award) => award.key);
  check('first day: the same passport call awards `first_stamp` and the `invited` medal', keys.includes('first_stamp') && keys.includes('invited'), keys.join(','));
  check('reward: B has a bonus life (6/5) in the database', dbLives(invited.userId) === 6, dbLives(invited.userId));
  check('reward: A has a bonus life (6/5) in the database', dbLives(inviter.userId) === 6, dbLives(inviter.userId));
  const medal = (userId, key) => psql(`select mint_status || '|' || coalesce(asset_address, '') || '|' || ref_id from itera.user_achievements where user_id = :'user_id'::uuid and achievement_key = :'key';`, { user_id: userId, key }).split('|');
  const invitedMedal = await until(async () => medal(invited.userId, 'invited'), ([state]) => state === 'minted', 20, 2000);
  check('reward: B\'s `invited` medal is minted', invitedMedal[0] === 'minted' && invitedMedal[1], invitedMedal.join(' '));
  const inviterMedal = await until(async () => medal(inviter.userId, 'friend_brought'), ([state]) => state === 'minted', 30, 2000);
  check('reward: A\'s `friend_brought` medal is minted in the background, ref = the invited learner', inviterMedal[0] === 'minted' && inviterMedal[1] && inviterMedal[2] === invited.userId, inviterMedal.join(' '));
  check('reward: A\'s companion says 6 lives on chain', (await chainLives(inviterAsset, 6)) === 6);
  check('reward: B\'s companion says 6 lives on chain', (await chainLives(invitedAsset, 6)) === 6);
  const profile = await (await fetch(`${FUNCTIONS}/learner-profile/${inviter.address}?lang=en&t=${Date.now()}`)).json();
  const shown = profile.medals?.find((entry) => entry.key === 'friend_brought');
  check('reward: `learner-profile` lists the new medal, verified on chain, companion 6/5', shown?.verified === true && shown.title === 'Brought a friend' && profile.companion?.lives === 6 && profile.companion?.max_lives === 5, JSON.stringify(shown));
  const art = await fetch(`${FUNCTIONS}/credential-meta/companion/${inviterCompanion.companion.id}/image.svg?t=${Date.now()}`);
  check('bonus life: the companion art draws 6/5 with a gold heart', art.status === 200 && (await art.text()).includes('6/5'));
  const livesNow = (await inviter.call('companion')).body.lives;
  check('bonus life: the lives answer says current 6, max 5, bonus 1, no regeneration', livesNow.current === 6 && livesNow.max === 5 && livesNow.bonus === 1 && livesNow.next_regen_at === null, JSON.stringify(livesNow));

  const replay = await invited.call('passport', { lang: 'en' });
  check('reward: paid once (a second passport call changes nothing)', replay.body.awards.length === 0 && dbLives(inviter.userId) === 6 && dbLives(invited.userId) === 6 && psql(`select count(*) from itera.user_achievements where achievement_key in ('friend_brought', 'invited') and user_id in (:'a'::uuid, :'b'::uuid);`, { a: inviter.userId, b: invited.userId }) === '2');
  const status2 = await inviter.call('referral', { action: 'status' });
  check('referral status: the invite is rewarded', status2.body.rewarded_count === 1 && status2.body.invited[0].status === 'rewarded', JSON.stringify(status2.body));
  check('no reward for the self-referral or the aged account', psql(`select count(*) from itera.referrals where invited_user_id in (:'a'::uuid, :'e'::uuid);`, { a: inviter.userId, e: old.userId }) === '0' && psql(`select count(*) from itera.user_achievements where user_id = :'e'::uuid;`, { e: old.userId }) === '0');

  // --- gift: refusals -------------------------------------------------------------------------
  const full = await invited.call('purchase-intent', { item_key: 'life_gift', recipient: inviter.address });
  check('gift: a recipient at 6/5 -> recipient_full', full.status === 409 && full.body.error === 'recipient_full', JSON.stringify(full.body));
  const fullAction = await action(actionUrl(inviter.address));
  check('action GET: disabled with the reason while the recipient is full', fullAction.status === 200 && fullAction.body.disabled === true && isActionError(fullAction.body.error) && isActionGet(fullAction.body));
  setLives(inviter.userId, 1);
  const self = await inviter.call('purchase-intent', { item_key: 'life_gift', recipient: inviter.address });
  check('gift: to yourself -> self_gift', self.status === 409 && self.body.error === 'self_gift', JSON.stringify(self.body));
  check('gift: unknown wallet -> recipient_not_found', (await invited.call('purchase-intent', { item_key: 'life_gift', recipient: stranger.address })).body.error === 'recipient_not_found');
  check('gift: no recipient -> invalid_ref', (await invited.call('purchase-intent', { item_key: 'life_gift' })).body.error === 'invalid_ref');
  const shop = await (await fetch(`${FUNCTIONS}/shop-items?lang=en`, { headers: { apikey } })).json();
  const withGift = await (await fetch(`${FUNCTIONS}/shop-items?lang=en&with=gift`, { headers: { apikey } })).json();
  const giftItem = withGift.find((item) => item.key === 'life_gift');
  check('shop-items: the gift is hidden from the shop list and listed with `?with=gift` at the pinned rate', !shop.some((item) => item.kind === 'gift') && giftItem?.kind === 'gift' && giftItem.price_lamports === 550000 && giftItem.price_label === 'US$ 0.10 ≈ 0.00055 SOL', JSON.stringify(giftItem));

  // --- gift: in-app path ----------------------------------------------------------------------
  const first = await giftInApp(invited, inviter.address);
  const gift = first.confirmed?.body.gift;
  check('gift in-app: confirm answers paid with the gift, both explorer links and the chain write', first.confirmed?.status === 200 && first.confirmed.body.status === 'paid' && gift?.to.wallet === inviter.address && gift.from.wallet === invited.address && gift.recipient.lives === 2 && first.confirmed.body.explorer_url?.includes(first.signature) && Boolean(first.confirmed.body.chain?.explorer_url) && first.confirmed.body.chain.lives === 2, JSON.stringify(first.confirmed?.body).slice(0, 300));
  check('gift in-app: the recipient has +1 life in the database', dbLives(inviter.userId) === 2);
  check('gift in-app: the recipient\'s companion says 2 lives on chain', (await chainLives(inviterAsset, 2)) === 2);
  const [rowStatus, rowTx, rowMirror, rowSource] = giftRow(first.intent.body.intent_id);
  check('gift in-app: recorded (delivered, payment and mirror signatures, source app)', rowStatus === 'delivered' && rowTx === first.signature && rowMirror.length > 60 && rowSource === 'app', `${rowStatus} ${rowSource}`);
  const twice = await invited.call('purchase-confirm', { intent_id: first.intent.body.intent_id, signature: first.signature, lang: 'en' });
  check('idempotency: the same intent and signature again -> paid, no second life, no second write', twice.status === 200 && twice.body.gift?.id === gift.id && !('chain' in twice.body) && twice.body.gift.mirror_explorer_url && dbLives(inviter.userId) === 2, JSON.stringify(twice.body).slice(0, 200));
  const nextIntent = await invited.call('purchase-intent', { item_key: 'life_gift', recipient: inviter.address });
  const reused = await invited.call('purchase-confirm', { intent_id: nextIntent.body.intent_id, signature: first.signature });
  check('idempotency: one payment cannot settle a second gift -> signature_reused', nextIntent.body.intent_id !== first.intent.body.intent_id && reused.status === 409 && reused.body.error === 'signature_reused' && dbLives(inviter.userId) === 2, JSON.stringify(reused.body));

  const inbox = await inviter.call('gifts', { action: 'inbox' });
  check('gifts inbox: the recipient sees one unseen gift and who sent it', inbox.status === 200 && inbox.body.gifts.length === 1 && inbox.body.gifts[0].from.wallet === invited.address && inbox.body.gifts[0].seen_at === null, JSON.stringify(inbox.body).slice(0, 200));
  check('gifts inbox: nobody else can mark it seen', (await invited.call('gifts', { action: 'seen', ids: [gift.id] })).body.seen === 0);
  const seen = await inviter.call('gifts', { action: 'seen', ids: [gift.id] });
  check('gifts seen: stored once, then the inbox is empty', seen.body.seen === 1 && (await inviter.call('gifts', { action: 'inbox' })).body.gifts.length === 0 && (await inviter.call('gifts', { action: 'seen', ids: [gift.id] })).body.seen === 0);

  // --- gift: Solana Action (this script is the blink client) ----------------------------------
  const options = await action(actionUrl(inviter.address), { method: 'OPTIONS' });
  check('action OPTIONS: CORS *, methods, headers, X-Action-Version, X-Blockchain-Ids (devnet)', options.status === 204 && specHeaders(options.headers));
  const get = await action(actionUrl(inviter.address));
  check('action GET: an ActionGetResponse with the spec headers', get.status === 200 && isActionGet(get.body) && specHeaders(get.headers) && !get.body.disabled, JSON.stringify(get.body).slice(0, 200));
  check('action GET: the icon is the recipient\'s companion art and the action posts back to this function', get.body.icon.includes(`/credential-meta/companion/${inviterCompanion.companion.id}/image.svg`) && get.body.links.actions[0].href.startsWith(actionUrl(inviter.address)));
  const icon = await fetch(get.body.icon);
  check('action GET: the icon is a reachable SVG', icon.status === 200 && (icon.headers.get('content-type') ?? '').includes('image/svg+xml'));
  const mapped = await action(`${FUNCTIONS}/action-gift/${inviter.address}`);
  check('action GET: the path form `/action-gift/<wallet>` (the actions.json mapping) answers the same action', mapped.status === 200 && mapped.body.title === get.body.title);
  for (const [name, answer, status] of [
    ['malformed wallet', await action(`${FUNCTIONS}/action-gift?to=nope`), 400],
    ['unknown wallet', await action(actionUrl(stranger.address)), 404],
    ['POST without an account', await action(actionUrl(inviter.address), { method: 'POST', body: {} }), 400],
    ['POST from the recipient (self-gift)', await action(actionUrl(inviter.address), { method: 'POST', body: { account: inviter.address } }), 400],
    ['POST to your own link (self-gift)', await action(actionUrl(invited.address), { method: 'POST', body: { account: invited.address } }), 400],
  ]) check(`action: ${name} -> ${status} with an ActionError and the spec headers`, answer.status === status && isActionError(answer.body) && specHeaders(answer.headers), JSON.stringify(answer.body));

  const blink = await blinkPay(stranger, inviter.address, treasury);
  check('action POST: an ActionPostResponse chained to a POST callback, with the spec headers', blink.post.status === 200 && isActionPost(blink.post.body) && specHeaders(blink.post.headers), JSON.stringify(blink.post.body).slice(0, 160));
  check('action POST: the transaction is the unsigned legacy transfer account -> treasury + Memo(intent id)', blink.exact === true);
  const wrongPayer = await action(blink.post.body.links.next.href, { method: 'POST', body: { account: invited.address, signature: blink.signature } });
  check('action callback: another account -> 422', wrongPayer.status === 422 && isActionError(wrongPayer.body));
  const callback = await until(() => action(blink.post.body.links.next.href, { method: 'POST', body: { account: stranger.address, signature: blink.signature } }), (answer) => answer.status !== 404, 6, 1500);
  check('action callback: a CompletedAction ("Life delivered ✓") with the spec headers', callback.status === 200 && isCompleted(callback.body) && callback.body.title === 'Life delivered ✓' && specHeaders(callback.headers), JSON.stringify(callback.body).slice(0, 200));
  check('action: the recipient has +1 life in the database', dbLives(inviter.userId) === 3);
  check('action: the recipient\'s companion says 3 lives on chain', (await chainLives(inviterAsset, 3)) === 3);
  const actionRow = giftRow(blink.giftId);
  check('action: recorded (delivered, payment signature, source action)', actionRow[0] === 'delivered' && actionRow[1] === blink.signature && actionRow[3] === 'action', actionRow.join(' ').slice(0, 60));
  const callbackAgain = await action(blink.post.body.links.next.href, { method: 'POST', body: { account: stranger.address, signature: blink.signature } });
  check('idempotency: the callback again -> completed, no second life', callbackAgain.status === 200 && isCompleted(callbackAgain.body) && dbLives(inviter.userId) === 3);

  // --- gift: the callback never arrives -------------------------------------------------------
  const lost = await blinkPay(stranger, inviter.address, treasury);
  check('reconcile: a paid blink with no callback is still pending', lost.post.status === 200 && giftRow(lost.giftId)[0] === 'pending' && dbLives(inviter.userId) === 3);
  await sleep(RECONCILE_WAIT_MS);
  const woke = await until(() => inviter.call('companion'), (answer) => answer.body.lives?.current === 4, 3, 2000);
  check('reconcile (Action): the recipient\'s next `companion` call finds the memo on chain and lands the gift', woke.body.lives.current === 4 && giftRow(lost.giftId)[0] === 'delivered' && giftRow(lost.giftId)[1] === lost.signature, `${JSON.stringify(woke.body.lives)} ${giftRow(lost.giftId)[0]}`);
  const lostApp = await giftInApp(invited, inviter.address, { confirm: false });
  await sleep(RECONCILE_WAIT_MS);
  const inboxAfter = await until(() => inviter.call('gifts', { action: 'inbox' }), (answer) => answer.body.gifts?.length === 3, 4, 2000);
  // The purchase is marked applied once the chain write it waits for is over, a few seconds after the life landed.
  const purchaseState = await until(async () => psql(`select status || '|' || (applied_at is not null) from itera.purchases where id = :'id'::uuid;`, { id: lostApp.intent.body.intent_id }), (value) => value === 'paid|true', 10, 1500);
  check('reconcile (in-app): a payment never confirmed lands when the recipient opens the app', dbLives(inviter.userId) === 5 && giftRow(lostApp.intent.body.intent_id)[0] === 'delivered' && purchaseState === 'paid|true' && inboxAfter.body.gifts.length === 3, `${dbLives(inviter.userId)} ${purchaseState} inbox ${inboxAfter.body.gifts?.length}`);
  const late = await invited.call('purchase-confirm', { intent_id: lostApp.intent.body.intent_id, signature: lostApp.signature, lang: 'en' });
  check('idempotency: the payer confirming after the reconcile -> paid, no second life', late.status === 200 && late.body.status === 'paid' && dbLives(inviter.userId) === 5);
  check('gift: 5 lives on chain after four gifts', (await chainLives(inviterAsset, 5)) === 5);

  // --- gift: bonus life and the daily limit ---------------------------------------------------
  const fifth = await giftInApp(invited, inviter.address);
  check('bonus life: a gift at 5/5 is not wasted (6/5 in the database and on chain)', fifth.confirmed?.status === 200 && fifth.confirmed.body.gift.recipient.lives === 6 && dbLives(inviter.userId) === 6 && (await chainLives(inviterAsset, 6)) === 6);
  setLives(inviter.userId, 2);
  const sixth = await invited.call('purchase-intent', { item_key: 'life_gift', recipient: inviter.address });
  check('rate limit: a sixth gift in a day -> 429 gift_limit (in-app)', sixth.status === 429 && sixth.body.error === 'gift_limit', JSON.stringify(sixth.body));
  const limitedGet = await action(actionUrl(inviter.address));
  const limitedPost = await action(actionUrl(inviter.address), { method: 'POST', body: { account: stranger.address } });
  check('rate limit: the Action is disabled on GET and refuses the POST with 429', limitedGet.body.disabled === true && limitedPost.status === 429 && isActionError(limitedPost.body), JSON.stringify(limitedPost.body));
  check('rate limit: nothing was charged or given', dbLives(inviter.userId) === 2 && psql(`select count(*) from itera.gifts where to_user_id = :'user_id'::uuid and status = 'delivered';`, { user_id: inviter.userId }) === '5');

  // --- row level security ---------------------------------------------------------------------
  const [mine, theirs, foreign, foreignReferrals, ownCode] = [await inviter.rest('gifts'), await invited.rest('gifts'), await old.rest('gifts'), await old.rest('referrals'), await inviter.rest('referral_codes')];
  check('RLS: a learner reads only gifts they received or sent, referrals they are part of, and their own code', mine.length === 5 && theirs.every((row) => row.from_user_id === invited.userId) && theirs.length >= 3 && foreign.length === 0 && foreignReferrals.length === 0 && ownCode.length === 1 && ownCode[0].code === code, `${mine.length} ${theirs.length} ${foreign.length}`);
  const write = await fetch(`${SUPABASE_URL}/rest/v1/gifts?id=eq.${gift.id}`, { method: 'PATCH', headers: { apikey, 'Content-Type': 'application/json', 'Content-Profile': 'itera', Authorization: `Bearer ${apikey}`, Prefer: 'return=representation' }, body: '{"seen_at":null}' });
  check('RLS: clients cannot write gifts', write.status >= 400 || (await write.json()).length === 0, write.status);

  // --- report ---------------------------------------------------------------------------------
  const after = { authority: await balance(authority.address), treasury: await balance(treasury) };
  const failed = results.filter((result) => !result.pass).length;
  console.log(`\nauthority: ${sol(before.authority)} -> ${sol(after.authority)} SOL (${sol(after.authority - before.authority)})`);
  console.log(`treasury:  ${sol(before.treasury)} -> ${sol(after.treasury)} SOL (${sol(after.treasury - before.treasury)})`);
  console.log(`recipient profile: /u/${inviter.address} · companion https://explorer.solana.com/address/${inviterAsset}?cluster=devnet`);
  console.log(`blink: https://dial.to/?action=${encodeURIComponent(`solana-action:${actionUrl(inviter.address)}`)}&cluster=devnet`);
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('gift-e2e failed:', error);
  process.exit(1);
});
