#!/usr/bin/env node
// End-to-end check of the Tera avatars on Solana devnet, against the hackathon project: the catalog
// in `shop-items`, the default avatar, equip, the companion art, a collectible bought through
// intent -> sign -> confirm and minted (NOT frozen) in the "Itera Avatars" collection, the public
// functions, the supply cap, the preview endpoint and the e-mail learner.
//
//   source ~/.config/itera-hackathon/supabase.env && export SUPABASE_ACCESS_TOKEN HACKATHON_DB_PASSWORD
//   node scripts/hackathon/avatar-e2e.mjs
//
// Mints ONE avatar asset (`base_iniciante`, US$ 0.20) and one companion; creates the avatars
// collection on the very first run. About 0.012 SOL of the mint authority and 0.008 SOL of the
// treasury (the wallet is funded from the treasury key and pays it back). Refuses to start when the
// authority would end below 0.62 SOL or the treasury below 0.25 SOL. The protected accounts (the
// owner wallet and the demo e-mail user) are only read through the public functions. The two
// throwaway users are deleted at the end; a test avatar it inserts for the cap check is removed too.
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, createPrivateKey, randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { base58Encode, base64Encode, buildTransferMessage, serializeTransaction } from '../../supabase/functions/_shared/solana-tx.ts';

const PROJECT_REF = 'nyzcbnnbffsizshiolbh';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const FUNCTIONS = `${SUPABASE_URL}/functions/v1`;
const STORAGE = `${SUPABASE_URL}/storage/v1/object/public/tera-avatars`;
const DB_URL = `postgresql://postgres.${PROJECT_REF}@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require`;
const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const SIWS_HOST = 'hackathon.iterahq.dev';
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const AUTHORITY_FLOOR = 620_000_000n;
const TREASURY_FLOOR = 250_000_000n;
const AUTHORITY_BUDGET = 20_000_000n;
const TREASURY_BUDGET = 12_000_000n;
const WALLET_FUNDING = 7_000_000n;
const LAMPORTS_PER_CENT = 55_000;
const OWNER_WALLET = 'CQziGuEV4i8yGBHwQQJMpe6tACSMR5jWUWjmYSGVDAhW';
const OWNER_CERTIFICATION = 'Dk35TCfPRrZymFnpP6MfQ55Zg9LEe7BDojStY1ZfQM45';
const FREE_KEYS = ['tera_normal', 'tera_feliz', 'tera_determinado', 'tera_piscada', 'tera_surpreso', 'tera_focado', 'tera_triste', 'tera_sorriso', 'tera_sob_pressao', 'tera_curioso'];
/** Every item that existed before avatars: key -> [kind, cents]. They must come back unchanged. */
const LEGACY = {
  ink_emerald: ['ink', 20],
  ink_violet: ['ink', 20],
  frame_gold_leaf: ['frame', 50],
  outfit_glasses: ['outfit', 20],
  outfit_crown: ['outfit', 30],
  outfit_headphones: ['outfit', 20],
  outfit_laurel: ['outfit', 50],
  life_refill: ['life', 10],
  life_gift: ['gift', 10],
};
const TEST_ITEM = `zz_e2e_cap_${randomBytes(4).toString('hex')}`;

const results = [];
const created = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sol = (lamports) => (Number(lamports) / 1e9).toFixed(6);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function check(name, pass, detail = '') {
  results.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 160)})` : ''}`);
}

function psql(sql, variables = {}) {
  const args = [DB_URL, '-X', '-At', '-v', 'ON_ERROR_STOP=1'];
  for (const [name, value] of Object.entries(variables)) args.push('-v', `${name}=${value}`);
  return execFileSync('psql', args, { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PGPASSWORD: requireEnv('HACKATHON_DB_PASSWORD') } }).trim();
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

function loadKeyfile(file) {
  const secret = Uint8Array.from(JSON.parse(readFileSync(file, 'utf8')));
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(secret.slice(0, 32))]), format: 'der', type: 'pkcs8' });
  return { privateKey, address: base58Encode(secret.slice(32)) };
}

async function signAndSend(signer, message) {
  const signature = sign(null, Buffer.from(message), signer.privateKey);
  return rpc('sendTransaction', [base64Encode(serializeTransaction(message, signature)), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
}

async function transfer(signer, recipient, lamports, memo) {
  const { blockhash } = (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
  const signature = await signAndSend(signer, buildTransferMessage({ payer: signer.address, recipient, lamports, memo, recentBlockhash: blockhash }));
  await waitConfirmed(signature);
  return signature;
}

async function projectKeys() {
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${requireEnv('SUPABASE_ACCESS_TOKEN')}` } });
  if (!response.ok) throw new Error(`could not read the project API keys (HTTP ${response.status})`);
  const keys = await response.json();
  const service = keys.find((entry) => entry.name === 'service_role')?.api_key ?? keys.find((entry) => entry.type === 'secret')?.api_key;
  const anon = keys.find((entry) => entry.name === 'anon')?.api_key;
  if (!anon || !service) throw new Error('the project is missing an anon or a service key');
  return { anon, service };
}

async function token(apikey, grant, body) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, { method: 'POST', headers: { apikey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(`sign-in (${grant}) failed: HTTP ${response.status}`);
  return payload;
}

function client(apikey, accessToken) {
  return async (name, { method = 'POST', body = {}, query = '' } = {}) => {
    const headers = { apikey, 'Content-Type': 'application/json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await fetch(`${FUNCTIONS}/${name}${query}`, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
}

async function publicGet(path) {
  const response = await fetch(`${FUNCTIONS}/${path}`);
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON (an SVG)
  }
  return { status: response.status, body, text, type: response.headers.get('content-type') ?? '', cache: response.headers.get('cache-control') ?? '' };
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
const iteraUserId = (authUserId) => psql(`select user_id from itera.identities where provider_subject = :'subject' limit 1;`, { subject: authUserId });
const adminHeaders = (serviceKey) => ({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' });
const published = async (key) => (await fetch(`${STORAGE}/${key}.webp`, { method: 'HEAD' })).ok || (await fetch(`${STORAGE}/${key}_128.webp`, { method: 'HEAD' })).ok;
const priceLabel = (cents) => `US$ ${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ≈ ${((cents * LAMPORTS_PER_CENT) / 1e9).toFixed(9).replace(/0+$/, '').replace(/\.$/, '')} SOL`;

async function createWalletLearner(keys) {
  const wallet = newWallet();
  const message = [`${SIWS_HOST} wants you to sign in with your Solana account:`, wallet.address, '', 'Sign in to Itera Hackathon', '', `URI: https://${SIWS_HOST}/login`, 'Version: 1', `Issued At: ${new Date().toISOString()}`].join('\n');
  const signature = sign(null, Buffer.from(message), wallet.privateKey).toString('base64url');
  const session = await token(keys.anon, 'web3', { chain: 'solana', message, signature });
  const userId = iteraUserId(session.user.id);
  created.push({ label: 'wallet', authUserId: session.user.id, userId });
  return { wallet, userId, call: client(keys.anon, session.access_token) };
}

async function createEmailLearner(keys) {
  const email = `avatar-e2e-${randomBytes(5).toString('hex')}@e2e.itera.invalid`;
  const password = randomBytes(18).toString('base64url');
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, { method: 'POST', headers: adminHeaders(keys.service), body: JSON.stringify({ email, password, email_confirm: true }) });
  const user = await response.json();
  if (!response.ok || !user.id) throw new Error(`could not create the e-mail user (HTTP ${response.status})`);
  const userId = iteraUserId(user.id);
  created.push({ label: 'e-mail', authUserId: user.id, userId });
  const session = await token(keys.anon, 'password', { email, password });
  return { userId, call: client(keys.anon, session.access_token) };
}

function removeTestItem() {
  try {
    psql(`delete from itera.avatar_assets where item_key = :'key'; delete from itera.purchases where item_key = :'key'; delete from itera.shop_items where key = :'key';`, { key: TEST_ITEM });
  } catch (error) {
    console.error(`could not remove the test avatar ${TEST_ITEM}:`, error.message);
  }
}

async function main(keys) {
  const authority = loadKeyfile(process.env.HACKATHON_AUTHORITY_KEYFILE ?? `${homedir()}/.config/itera-hackathon/devnet-authority.json`);
  const treasuryKey = loadKeyfile(process.env.HACKATHON_TREASURY_KEYFILE ?? `${homedir()}/.config/itera-hackathon/devnet-treasury.json`);
  const treasury = psql(`select value from itera.onchain_config where key = 'treasury';`);
  if (treasuryKey.address !== treasury) throw new Error('the treasury keyfile is not the configured treasury');
  const before = { authority: await balance(authority.address), treasury: await balance(treasury) };
  console.log(`BEFORE  authority ${sol(before.authority)} SOL · treasury ${sol(before.treasury)} SOL`);
  if (before.authority - AUTHORITY_BUDGET < AUTHORITY_FLOOR) throw new Error(`STOP: the authority (${sol(before.authority)} SOL) cannot spend ${sol(AUTHORITY_BUDGET)} and stay above ${sol(AUTHORITY_FLOOR)}`);
  if (before.treasury - TREASURY_BUDGET < TREASURY_FLOOR) throw new Error(`STOP: the treasury (${sol(before.treasury)} SOL) cannot spend ${sol(TREASURY_BUDGET)} and stay above ${sol(TREASURY_FLOOR)}`);
  const floors = async (step) => {
    const now = { authority: await balance(authority.address), treasury: await balance(treasury) };
    console.log(`        after ${step}: authority ${sol(now.authority)} · treasury ${sol(now.treasury)}`);
    if (now.authority < AUTHORITY_FLOOR + 5_000_000n || now.treasury < TREASURY_FLOOR + 3_000_000n) throw new Error(`STOP: too close to a floor after ${step}`);
    return now;
  };

  // --- the catalog, without a token -------------------------------------------------------------
  const anonymous = client(keys.anon, null);
  const shop = await anonymous('shop-items', { method: 'GET', query: '?with=gift' });
  const avatars = (shop.body ?? []).filter((item) => item.kind === 'avatar');
  const byKey = Object.fromEntries(avatars.map((item) => [item.key, item]));
  check('shop-items (no token): 43 avatars listed', shop.status === 200 && avatars.length === 43, avatars.length);
  check('shop-items (no token): the 10 free avatars are free and owned by everyone', FREE_KEYS.every((key) => byKey[key]?.free === true && byKey[key].owned === true && byKey[key].price_lamports === 0 && byKey[key].group === 'expression' && byKey[key].allows_outfit === true));
  const paid = avatars.filter((item) => !item.free);
  check('shop-items (no token): 33 collectibles, none owned, none equipped', paid.length === 33 && paid.every((item) => !item.owned && !item.equipped && item.asset_address === null && item.allows_outfit === false));
  const shapeKeys = ['key', 'kind', 'title', 'description', 'rarity', 'rarity_label', 'tier_name', 'group', 'free', 'price_usd_cents', 'price_lamports', 'price_label', 'image_url', 'thumb_url', 'supply', 'sold_out', 'owned', 'equipped', 'asset_address'];
  check('shop-items: every avatar carries the whole contract shape', avatars.every((item) => shapeKeys.every((key) => key in item) && typeof item.supply.minted === 'number' && 'max' in item.supply), shapeKeys.filter((key) => !(key in (avatars[0] ?? {}))).join(','));
  const mispriced = paid.filter((item) => item.price_lamports !== item.price_usd_cents * LAMPORTS_PER_CENT || item.price_label !== priceLabel(item.price_usd_cents));
  check('shop-items: cents, lamports and label agree at the pinned rate for every collectible', mispriced.length === 0, mispriced.map((item) => `${item.key}: ${item.price_label}`).join('; '));
  const pyramid = { base_iniciante: [20, null, 'common'], acc_cyber_chip: [50, null, 'rare'], base_lider: [100, 500, 'rare'], base_guerreiro: [1000, 100, 'epic'], event_natal: [1000, 100, 'epic'], special_dourado: [10000, 25, 'legendary'], special_arco_iris: [100000, 5, 'mythic'], event_space: [100000, 5, 'mythic'] };
  const offPyramid = Object.entries(pyramid).filter(([key, [cents, cap, rarity]]) => byKey[key]?.price_usd_cents !== cents || byKey[key]?.supply.max !== cap || byKey[key]?.rarity !== rarity);
  check('shop-items: the price pyramid (US$ 0.20 … US$ 1,000.00) with its caps and tiers', offPyramid.length === 0 && byKey.event_space?.price_label === 'US$ 1,000.00 ≈ 5.5 SOL' && byKey.event_space?.price_lamports === 5_500_000_000 && byKey.event_space?.tier_name === 'Tera Mítico' && byKey.base_lider?.tier_name === 'Super Tera' && byKey.base_guerreiro?.rarity_label === 'Muito raro', JSON.stringify(offPyramid));
  check('shop-items: image URLs are derived from the key', avatars.every((item) => item.image_url === `${STORAGE}/${item.key}.webp` && item.thumb_url === `${STORAGE}/${item.key}_128.webp`));
  const legacy = (shop.body ?? []).filter((item) => item.kind !== 'avatar');
  const legacyOff = Object.entries(LEGACY).filter(([key, [kind, cents]]) => {
    const item = legacy.find((entry) => entry.key === key);
    return !item || item.kind !== kind || item.price_usd_cents !== cents || item.price_lamports !== cents * LAMPORTS_PER_CENT || item.price_label !== priceLabel(cents);
  });
  check('regression: every pre-existing item is still listed with its kind and price', legacy.length === Object.keys(LEGACY).length && legacyOff.length === 0, `${legacy.length} items; off: ${legacyOff.map(([key]) => key).join(',')}`);

  // --- preview endpoint ---------------------------------------------------------------------------
  const certPreview = await publicGet('credential-meta/preview.svg?type=certification&trail=Semana%201%20%C2%B7%20HTML&days=2&total=5&tier=bronze&ink=emerald&frame=gold-leaf&lang=pt');
  check('preview: certification SVG with the ink and the frame, cached', certPreview.status === 200 && certPreview.type.startsWith('image/svg+xml') && certPreview.text.includes('data-ink="emerald"') && certPreview.text.includes('data-frame="gold-leaf"') && certPreview.text.includes('Semana 1 · HTML') && /max-age=\d+/.test(certPreview.cache), `${certPreview.status} ${certPreview.cache}`);
  const companionPreview = await publicGet('credential-meta/preview.svg?type=companion&avatar=tera_normal&outfit=outfit_crown&lives=3&level=7');
  check('preview: companion SVG with the outfit, lives and level', companionPreview.status === 200 && companionPreview.text.includes('data-outfit="outfit_crown"') && companionPreview.text.includes('3/5') && /N[ÍI]VEL 7/.test(companionPreview.text));
  const paintingPreview = await publicGet('credential-meta/preview.svg?type=companion&avatar=base_lider&outfit=outfit_crown');
  check('preview: a painting avatar never wears the outfit', paintingPreview.status === 200 && !paintingPreview.text.includes('data-outfit'));
  const hostile = await publicGet(`credential-meta/preview.svg?type=certification&trail=${encodeURIComponent('<script>alert(1)</script>' + 'x'.repeat(200))}&days=999&total=999&tier=platinum&ink=red&frame=neon`);
  check('preview: hostile and out-of-range input is escaped and clamped, not refused', hostile.status === 200 && !hostile.text.includes('<script>') && hostile.text.includes('12<tspan') && !hostile.text.includes('data-frame') && !hostile.text.includes('x'.repeat(41)));
  const unknownAvatar = await publicGet(`credential-meta/preview.svg?type=companion&avatar=${encodeURIComponent('../../etc/passwd')}&lives=99&level=1000`);
  check('preview: an avatar outside the catalog falls back to the default, numbers clamp', unknownAvatar.status === 200 && !unknownAvatar.text.includes('data-avatar') && unknownAvatar.text.includes('5/5') && /N[ÍI]VEL 99/.test(unknownAvatar.text));
  const noType = await publicGet('credential-meta/preview.svg?type=medal');
  check('preview: an unknown type -> 400 invalid_type', noType.status === 400 && noType.body?.error === 'invalid_type');
  check('preview: every SVG stays under 250 KB', [certPreview, companionPreview, paintingPreview].every((entry) => entry.text.length < 250_000), [certPreview, companionPreview, paintingPreview].map((entry) => entry.text.length).join('/'));

  // --- a wallet learner: default avatar, equip, art, mirror ---------------------------------------
  const learner = await createWalletLearner(keys);
  const { wallet, call } = learner;
  console.log(`wallet ${wallet.address} · itera user ${learner.userId}`);
  const first = await call('companion', { body: { lang: 'pt' } });
  check('companion: the default avatar is tera_normal, always present', first.status === 200 && first.body.avatar?.key === 'tera_normal' && first.body.avatar.title === 'Normal' && first.body.avatar.rarity === 'common' && first.body.avatar.tier_name === 'Tera' && first.body.avatar.image_url === `${STORAGE}/tera_normal.webp` && first.body.avatar.thumb_url === `${STORAGE}/tera_normal_128.webp` && first.body.avatar.asset_address === null && first.body.avatar.allows_outfit === true, JSON.stringify(first.body.avatar));
  check('companion: lives and companion blocks are what they were', first.body.lives?.current === 5 && first.body.lives.max === 5 && ['pending', 'minted'].includes(first.body.companion?.mint_status) && first.body.wallet === wallet.address);
  await transfer(treasuryKey, wallet.address, WALLET_FUNDING, 'e2e: avatar wallet funding');
  const minted = await until(() => call('companion'), (response) => response.body.companion?.mint_status === 'minted', 60, 2000);
  const companion = minted.body.companion;
  check('companion: minted on devnet', companion?.mint_status === 'minted' && Boolean(companion.asset_address), companion?.asset_address);
  let attributes = attributesOf(await verifyAsset(companion.asset_address));
  check('companion asset: no avatar attribute while the default is worn (nothing new is written)', attributes.kind === 'companion' && !('avatar' in attributes), JSON.stringify(attributes));
  await floors('the companion mint');
  const artBefore = await publicGet(`credential-meta/companion/${companion.id}/image.svg?t=${Date.now()}`);

  const badEquip = await call('companion', { body: { equip: { avatar: 42 } } });
  check('companion: malformed avatar -> 400 invalid_body', badEquip.status === 400 && badEquip.body.error === 'invalid_body');
  const notOwned = await call('companion', { body: { equip: { avatar: 'base_lider' } } });
  check('companion: equip base_lider without owning it -> 409 not_owned', notOwned.status === 409 && notOwned.body.error === 'not_owned');
  const unknownEquip = await call('companion', { body: { equip: { avatar: 'does_not_exist' } } });
  check('companion: equip an avatar outside the catalog -> 409 not_owned', unknownEquip.status === 409 && unknownEquip.body.error === 'not_owned');

  const happy = await call('companion', { body: { lang: 'en', equip: { avatar: 'tera_feliz' } } });
  check('companion: a free avatar is equipped by anyone', happy.status === 200 && happy.body.avatar?.key === 'tera_feliz' && happy.body.avatar.title === 'Happy' && happy.body.avatar.allows_outfit === true && happy.body.companion.outfit === null, JSON.stringify(happy.body.avatar));
  check('companion: the art URL changes with the avatar', happy.body.companion.image_url !== minted.body.companion.image_url && happy.body.companion.image_url.includes('tera_feliz'), happy.body.companion.image_url);
  const artHappy = await publicGet(happy.body.companion.image_url.replace(`${FUNCTIONS}/`, ''));
  const happyPublished = await published('tera_feliz');
  if (happyPublished) {
    check('companion art: draws the equipped avatar (differs from the default card)', artHappy.status === 200 && artHappy.text.includes('data-avatar="tera_feliz"') && artHappy.text !== artBefore.text && artHappy.text.length < 250_000, `${artHappy.text.length} bytes`);
  } else {
    console.log('NOTE    tera_feliz is not uploaded to storage yet: the card must fall back to the built-in Tera');
    check('companion art: safe fallback to the built-in Tera while the picture is not published', artHappy.status === 200 && artHappy.type.startsWith('image/svg+xml') && !artHappy.text.includes('data-avatar') && artHappy.text.includes('<image'), `${artHappy.text.length} bytes`);
  }
  const mirrored = await until(() => verifyAsset(companion.asset_address), (verify) => attributesOf(verify).avatar === 'tera_feliz', 40, 2500);
  attributes = attributesOf(mirrored);
  check('companion asset: the avatar is mirrored on chain by the serialized mirror', attributes.avatar === 'tera_feliz' && attributes.lives === '5' && attributes.outfit === 'none', JSON.stringify(attributes));
  check('credential-verify (companion): parsed companion names the avatar', mirrored.body.companion?.avatar === 'tera_feliz' && mirrored.body.achievement?.key === 'companion');
  await floors('the equip mirror');

  // --- purchase refusals that take nothing ---------------------------------------------------------
  const free = await call('purchase-intent', { body: { item_key: 'tera_feliz' } });
  check('purchase-intent: a free avatar -> 409 free_item', free.status === 409 && free.body.error === 'free_item', JSON.stringify(free.body));
  const walletBalance = await balance(wallet.address);
  const mythic = await call('purchase-intent', { body: { item_key: 'event_space' } });
  check('purchase-intent: event_space with a near-empty wallet -> 402 insufficient_funds with the right amounts', mythic.status === 402 && mythic.body.error === 'insufficient_funds' && mythic.body.price_lamports === 5_500_000_000 && mythic.body.required_lamports === 5_500_000_000 + 5_000 + 890_880 && mythic.body.balance_lamports === Number(walletBalance), JSON.stringify(mythic.body));
  check('purchase-intent: that refusal reserved no serial and opened no intent', psql(`select (select count(*) from itera.avatar_assets where item_key = 'event_space' and user_id = :'user'::uuid) + (select count(*) from itera.purchases where item_key = 'event_space' and user_id = :'user'::uuid);`, { user: learner.userId }) === '0');
  const withRef = await call('purchase-intent', { body: { item_key: 'base_iniciante', ref_id: '11111111-1111-4111-8111-111111111111' } });
  check('purchase-intent: an avatar takes no ref -> 400 invalid_ref', withRef.status === 400 && withRef.body.error === 'invalid_ref');

  // --- buy the cheapest collectible ---------------------------------------------------------------
  const supplyBefore = Number(psql(`select coalesce((select minted from itera.avatar_supply where item_key = 'base_iniciante'), 0);`));
  const intent = await call('purchase-intent', { body: { item_key: 'base_iniciante' } });
  check('purchase-intent: base_iniciante -> an intent at US$ 0.20', intent.status === 200 && intent.body.price_lamports === 1_100_000 && intent.body.price_label === 'US$ 0.20 ≈ 0.0011 SOL' && intent.body.memo === intent.body.intent_id, JSON.stringify(intent.body).slice(0, 140));
  const hold = psql(`select mint_status || '|' || serial || '|' || (reserved_until > now()) || '|' || (purchase_id = :'intent'::uuid) from itera.avatar_assets where user_id = :'user'::uuid and item_key = 'base_iniciante';`, { user: learner.userId, intent: intent.body.intent_id });
  check('reservation: the serial is held from the intent, with an expiry tied to it', /^reserved\|\d+\|true\|true$/.test(hold), hold);
  const heldSerial = Number(hold.split('|')[1]);
  const again = await call('purchase-intent', { body: { item_key: 'base_iniciante' } });
  check('purchase-intent: asking again is the same intent and the same hold', again.status === 200 && again.body.intent_id === intent.body.intent_id && psql(`select count(*) from itera.avatar_assets where user_id = :'user'::uuid and item_key = 'base_iniciante';`, { user: learner.userId }) === '1');
  const equipHeld = await call('companion', { body: { equip: { avatar: 'base_iniciante' } } });
  check('companion: an unpaid hold is not ownership -> not_owned', equipHeld.status === 409 && equipHeld.body.error === 'not_owned');

  const signature = await signAndSend(wallet, Buffer.from(again.body.message_base64, 'base64'));
  const confirm = await until(() => call('purchase-confirm', { body: { intent_id: intent.body.intent_id, signature, lang: 'pt' } }), (response) => !['tx_not_found', 'apply_failed'].includes(response.body.error), 12, 2500);
  const bought = confirm.body.avatar;
  check('purchase-confirm: paid, with the avatar block', confirm.status === 200 && confirm.body.status === 'paid' && confirm.body.item?.kind === 'avatar' && bought?.key === 'base_iniciante' && typeof bought.asset_address === 'string' && bought.serial === heldSerial && bought.image_url === `${STORAGE}/base_iniciante.webp` && bought.explorer_url?.includes(bought.asset_address), JSON.stringify(confirm.body).slice(0, 300));
  if (!bought?.asset_address) throw new Error('the avatar was not minted: stopping before anything else is spent');
  console.log(`avatar asset ${bought.asset_address} · serial #${bought.serial} · ${bought.explorer_url}`);
  await floors('the avatar mint');
  const collection = psql(`select value from itera.onchain_config where key = 'collection_avatars';`);
  const verify = await until(() => verifyAsset(bought.asset_address), (response) => response.status === 200, 10, 2000);
  const assetAttributes = attributesOf(verify);
  check('avatar asset: verified, in the Itera Avatars collection, owned by the buyer', verify.body.verified === true && verify.body.checks.collection_is_ours && verify.body.checks.update_authority_is_ours && verify.body.collection === collection && verify.body.owner === wallet.address, `collection ${collection}`);
  check('avatar asset: NOT frozen (a transferable collectible)', verify.body.frozen === false && verify.body.checks.soulbound === false);
  check('avatar asset: named with tier, title and serial', verify.body.name === `Tera · Iniciante #${bought.serial}`, verify.body.name);
  check('avatar asset: attributes kind, key, rarity, tier, serial, supply_cap', assetAttributes.kind === 'avatar' && assetAttributes.key === 'base_iniciante' && assetAttributes.rarity === 'common' && assetAttributes.tier === 'Tera' && assetAttributes.serial === String(bought.serial) && assetAttributes.supply_cap === 'open', JSON.stringify(assetAttributes));
  check('credential-verify: achievement.key = avatar with the parsed avatar and its image, no user id', verify.body.achievement?.key === 'avatar' && verify.body.avatar?.key === 'base_iniciante' && verify.body.avatar.rarity === 'common' && verify.body.avatar.tier_name === 'Tera' && verify.body.avatar.serial === bought.serial && verify.body.avatar.supply_cap === null && verify.body.image_url === `${STORAGE}/base_iniciante.webp` && !verify.text.includes(learner.userId), JSON.stringify(verify.body.avatar));
  const meta = await publicGet(verify.body.uri.replace(`${FUNCTIONS}/`, ''));
  check('credential-meta: the asset URI serves Metaplex JSON with the published image and "not soulbound"', meta.status === 200 && meta.body?.image === `${STORAGE}/base_iniciante.webp` && /NOT soulbound/.test(meta.body.description) && meta.body.name.endsWith(`#${bought.serial}`) && verify.body.uri.includes('/credential-meta/avatar/') && !meta.text.includes(learner.userId), verify.body.uri);
  const collectionMeta = await publicGet('credential-meta/collection/avatars');
  check('credential-meta: the avatars collection has metadata', collectionMeta.status === 200 && collectionMeta.body?.name === 'Itera Avatars');

  const confirmAgain = await call('purchase-confirm', { body: { intent_id: intent.body.intent_id, signature, lang: 'pt' } });
  const ledger = psql(`select (select count(*) from itera.avatar_assets where user_id = :'user'::uuid and item_key = 'base_iniciante' and mint_status = 'minted') || '|' || (select count(*) from itera.payments where tx_signature = :'sig') || '|' || (select count(*) from itera.payments where ref_id = :'intent'::uuid) || '|' || (select count(*) from itera.purchases where user_id = :'user'::uuid and item_key = 'base_iniciante' and status = 'paid' and applied_at is not null and refund_due_at is null);`, { user: learner.userId, sig: signature, intent: intent.body.intent_id });
  check('purchase-confirm twice: idempotent, the same asset, one ledger entry, one row', confirmAgain.status === 200 && confirmAgain.body.avatar?.asset_address === bought.asset_address && confirmAgain.body.avatar.serial === bought.serial && ledger === '1|1|1|1', ledger);
  const reuse = await call('purchase-intent', { body: { item_key: 'base_iniciante' } });
  check('purchase-intent: owned already -> 409 already_owned', reuse.status === 409 && reuse.body.error === 'already_owned');
  check('supply: one more unit is counted', Number(psql(`select minted from itera.avatar_supply where item_key = 'base_iniciante';`)) === supplyBefore + 1);
  check('constraint: a second row with the same (avatar, serial) is refused by the database', (() => {
    try {
      psql(`insert into itera.avatar_assets (user_id, item_key, serial, mint_status) select id, 'base_iniciante', :serial, 'pending' from itera.users where id <> :'user'::uuid limit 1;`, { serial: bought.serial, user: learner.userId });
      return false;
    } catch (error) {
      return /avatar_assets_item_key_serial_key|duplicate key/.test(String(error.stderr ?? error.message));
    }
  })());

  // --- wear it ------------------------------------------------------------------------------------
  const worn = await call('companion', { body: { lang: 'pt', equip: { avatar: 'base_iniciante' } } });
  check('companion: the owned collectible is equipped, with its asset and no outfit allowed', worn.status === 200 && worn.body.avatar?.key === 'base_iniciante' && worn.body.avatar.asset_address === bought.asset_address && worn.body.avatar.allows_outfit === false && worn.body.avatar.title === 'Iniciante', JSON.stringify(worn.body.avatar));
  const artWorn = await publicGet(worn.body.companion.image_url.replace(`${FUNCTIONS}/`, ''));
  if (await published('base_iniciante')) {
    check('companion art: shows the collectible', artWorn.text.includes('data-avatar="base_iniciante"') && !artWorn.text.includes('data-outfit') && artWorn.text.length < 250_000, `${artWorn.text.length} bytes`);
  } else {
    console.log('NOTE    base_iniciante is not uploaded to storage yet: fallback card');
    check('companion art: safe fallback while the collectible picture is not published', artWorn.status === 200 && artWorn.type.startsWith('image/svg+xml') && !artWorn.text.includes('data-outfit'));
  }
  const mirroredWorn = await until(() => verifyAsset(companion.asset_address), (response) => attributesOf(response).avatar === 'base_iniciante', 40, 2500);
  check('companion asset: the collectible is mirrored on chain', attributesOf(mirroredWorn).avatar === 'base_iniciante');
  const mine = await call('shop-items', { method: 'GET', query: '?lang=pt' });
  const mineByKey = Object.fromEntries((mine.body ?? []).map((item) => [item.key, item]));
  check('shop-items (token): the collectible is owned and equipped, with its asset and supply', mineByKey.base_iniciante?.owned === true && mineByKey.base_iniciante.equipped === true && mineByKey.base_iniciante.asset_address === bought.asset_address && mineByKey.base_iniciante.supply.minted === supplyBefore + 1 && mineByKey.tera_feliz?.equipped === false && mineByKey.base_lider?.owned === false);
  const profile = await publicGet(`learner-profile/${wallet.address}?t=${Date.now()}`);
  const listed = (profile.body?.avatars ?? []).find((entry) => entry.asset === bought.asset_address);
  check('learner-profile: lists the avatar as verified, and the equipped one', profile.status === 200 && listed?.verified === true && listed.key === 'base_iniciante' && listed.serial === bought.serial && listed.tier_name === 'Tera' && listed.rarity === 'common' && listed.image_url === `${STORAGE}/base_iniciante.webp` && Boolean(listed.explorer_url) && profile.body.avatar?.key === 'base_iniciante' && !profile.text.includes(learner.userId), JSON.stringify(listed));
  await floors('the purchase');

  // --- the cap, without spending: a test avatar with one unit, already taken ------------------------
  const email = await createEmailLearner(keys);
  try {
    psql(
      `insert into itera.shop_items (key, kind, price_lamports, price_usd_cents, price_label, title_i18n, description_i18n, active, sort, rarity, avatar_group, supply_cap, image_key)
       values (:'key', 'avatar', 1100000, 20, 'US$ 0.20 ≈ 0.0011 SOL', '{"pt": "Teste", "en": "Test"}', '{}', true, 99999, 'mythic', 'event', 1, 'event_space');
       insert into itera.avatar_assets (user_id, item_key, serial, mint_status) values (:'holder'::uuid, :'key', 1, 'pending');`,
      { key: TEST_ITEM, holder: email.userId },
    );
    const capShop = await anonymous('shop-items', { method: 'GET' });
    const capItem = (capShop.body ?? []).find((item) => item.key === TEST_ITEM);
    check('cap: an avatar whose units are all taken is listed sold_out', capItem?.sold_out === true && capItem.supply.minted === 1 && capItem.supply.max === 1 && capItem.owned === false, JSON.stringify(capItem?.supply));
    const capIntent = await call('purchase-intent', { body: { item_key: TEST_ITEM } });
    check('cap: purchase-intent on it -> 409 sold_out, and no sixth row, no intent', capIntent.status === 409 && capIntent.body.error === 'sold_out' && psql(`select (select count(*) from itera.avatar_assets where item_key = :'key') || '|' || (select count(*) from itera.purchases where item_key = :'key');`, { key: TEST_ITEM }) === '1|0', JSON.stringify(capIntent.body));
    // One unit returns to the pool (an unpaid hold whose window ended): the next buyer gets serial 1 again.
    psql(`update itera.avatar_assets set mint_status = 'reserved', reserved_until = now() - interval '1 second' where item_key = :'key';`, { key: TEST_ITEM });
    const freed = await call('purchase-intent', { body: { item_key: TEST_ITEM } });
    const freedRow = psql(`select user_id || '|' || serial || '|' || mint_status from itera.avatar_assets where item_key = :'key';`, { key: TEST_ITEM });
    check('cap: an expired unpaid hold gives its serial back to the next buyer', freed.status === 200 && freedRow === `${learner.userId}|1|reserved`, freedRow);
  } finally {
    removeTestItem();
  }
  check('cap: the test avatar is gone again', psql(`select count(*) from itera.shop_items where key = :'key';`, { key: TEST_ITEM }) === '0');

  // --- an e-mail learner --------------------------------------------------------------------------
  const emailFirst = await email.call('companion', { body: { lang: 'pt' } });
  check('e-mail learner: gets the default avatar too', emailFirst.status === 200 && emailFirst.body.avatar?.key === 'tera_normal' && emailFirst.body.wallet === null && emailFirst.body.companion.mint_status === 'unclaimed', JSON.stringify(emailFirst.body.avatar));
  const emailEquip = await email.call('companion', { body: { lang: 'pt', equip: { avatar: 'tera_curioso' } } });
  check('e-mail learner: equips a free avatar', emailEquip.status === 200 && emailEquip.body.avatar?.key === 'tera_curioso' && emailEquip.body.avatar.title === 'Curioso');
  const emailNotOwned = await email.call('companion', { body: { equip: { avatar: 'base_iniciante' } } });
  check('e-mail learner: a collectible -> not_owned', emailNotOwned.status === 409 && emailNotOwned.body.error === 'not_owned');
  const emailIntent = await email.call('purchase-intent', { body: { item_key: 'base_iniciante' } });
  check('e-mail learner: purchase-intent avatar -> 403 no_wallet', emailIntent.status === 403 && emailIntent.body.error === 'no_wallet');
  const emailShop = await email.call('shop-items', { method: 'GET' });
  check('e-mail learner: shop-items marks the free avatar it wears', (emailShop.body ?? []).find((item) => item.key === 'tera_curioso')?.equipped === true);

  // --- regression, read-only ------------------------------------------------------------------------
  const ownerCert = await publicGet(`credential-verify/${OWNER_CERTIFICATION}?t=${Date.now()}`);
  check('regression: the owner certification is still verified and soulbound', ownerCert.status === 200 && ownerCert.body.verified === true && ownerCert.body.frozen === true && ownerCert.body.achievement?.key === 'trail_pass' && !('avatar' in ownerCert.body));
  const ownerProfile = await publicGet(`learner-profile/${OWNER_WALLET}?t=${Date.now()}`);
  check('regression: the owner profile still lists its assets, now with an avatar of the catalog (the one the owner wears)', ownerProfile.status === 200 && ownerProfile.body.certifications.length >= 1 && ownerProfile.body.medals.length >= 1 && ownerProfile.body.companion?.verified === true && ownerProfile.body.verified_count >= 5 && Boolean(byKey[ownerProfile.body.avatar?.key]) && Array.isArray(ownerProfile.body.avatars), `verified ${ownerProfile.body.verified_count}, avatar ${ownerProfile.body.avatar?.key}`);
  // The owner is a live account and may wear any avatar: the companion names it only when it is not the default.
  const ownerWorn = ownerProfile.body.companion?.avatar;
  check('regression: the owner companion names an avatar only when it is not the default', ownerWorn === undefined ? /v=\d+-\d+-\d+-[a-z_]+$/.test(ownerProfile.body.companion?.image_url ?? '') && !ownerProfile.body.companion.image_url.includes('tera_') : ownerWorn !== 'tera_normal' && ownerProfile.body.companion.image_url.endsWith(`-${ownerWorn}`), ownerProfile.body.companion?.image_url);

  const after = await floors('everything');
  console.log(`AFTER   authority ${sol(after.authority)} SOL (${sol(after.authority - before.authority)}) · treasury ${sol(after.treasury)} SOL (${sol(after.treasury - before.treasury)})`);
  console.log(`COLLECTION ${collection}`);
  console.log(`EXAMPLE    ${bought.asset_address}  https://explorer.solana.com/address/${bought.asset_address}?cluster=devnet`);
}

const keys = await projectKeys();
let failed = false;
try {
  await main(keys);
} catch (error) {
  failed = true;
  console.error('ABORTED', error);
} finally {
  removeTestItem();
  for (const user of created) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.authUserId}`, { method: 'DELETE', headers: adminHeaders(keys.service) });
    console.log(`cleanup: ${user.label} user ${response.ok ? 'deleted' : `NOT deleted (HTTP ${response.status})`}`);
  }
}
const passed = results.filter((result) => result.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
for (const result of results.filter((entry) => !entry.pass)) console.log(`  FAILED: ${result.name}`);
process.exit(failed || passed !== results.length ? 1 : 0);
