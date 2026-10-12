#!/usr/bin/env node
// The path of the 3-minute demo video, clicked by a robot with a THROWAWAY wallet (never the recording wallet):
//   1 learn   Day 1 of Week 1 · HTML: 1 concept + 3 exercises (x-ray, multiple choice, connect: one miss, then right)
//   2 chest   the stamp screen of the lesson shows the day's chest and the Tera that comes out
//   3 world   /world: the Tera just earned is unlocked, every other one is locked, tiers say how they are obtained
//   4 profile /profile: the wallet balance in SOL
//   5 buy     /shop: buys one Tera with SOL through a fake Phantom (devnet), wears it, and the profile shows it
//   6 world   /world again: the bought Tera is unlocked too, and says it was bought
//
//   node scripts/hackathon/demo-e2e.mjs --base http://127.0.0.1:5199 --out /tmp/demo [--wallet-file F] [--steps 1,2,3,4,5,6]
//     [--fund 6000000]   lamports the authority sends the throwaway wallet before step 4 when it holds less
//     [--buy <item key>] the Tera to buy (default: the first one of the cheapest tier on the shelf)
// Environment (source ~/.config/itera-hackathon/supabase.env): HACKATHON_DB_PASSWORD, SUPABASE_ACCESS_TOKEN.
// It reads activity specs with psql to know the answers; every answer and the purchase go through the UI.
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { resolveSpec } from '../../supabase/functions/_shared/grading.ts';
import { base58Encode } from '../../supabase/functions/_shared/solana-tx.ts';
import { servedIds, servedLesson } from './day-solver.lib.mjs';
import { FUNCTIONS, PROJECT_REF, PROTECTED_WALLET, SUPABASE_URL, anonKey, fund, loadAuthority, psql, rpc, sleep } from './social-e2e.lib.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const BASE = option('base', 'https://hackathon.iterahq.dev').replace(/\/$/, '');
const OUT = option('out', '/tmp/hk-demo-e2e');
const WALLET_FILE = option('wallet-file', `${OUT}/wallet.json`);
const STEPS = new Set(option('steps', '1,2,3,4,5,6').split(',').map(Number));
const FUND_LAMPORTS = BigInt(option('fund', '6000000'));
const BUY_KEY = option('buy', '');
const LESSON_ID = '0e7d6618-f9ba-46ba-bf28-71cf86f32716';
const SIWS_HOST = 'hackathon.iterahq.dev';
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

mkdirSync(OUT, { recursive: true });
const results = [];
const log = (line) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
const check = (name, pass, detail = '') => {
  results.push({ name, pass: Boolean(pass), detail: String(detail).slice(0, 300) });
  log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 240)})` : ''}`);
  return Boolean(pass);
};
let shots = 0;
const shot = async (page, name, fullPage = false) => {
  shots += 1;
  const path = `${OUT}/${String(shots).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path, fullPage }).catch(() => {});
  return path;
};

function base58Decode(text) {
  let value = 0n;
  for (const char of text) value = value * 58n + BigInt(ALPHABET.indexOf(char));
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const zeros = text.match(/^1*/)[0].length;
  return Buffer.concat([Buffer.alloc(zeros), value === 0n ? Buffer.alloc(0) : Buffer.from(hex, 'hex')]);
}

// ── Wallet and session ──────────────────────────────────────────────────────────────────────────
const keyOf = (seed) => createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: 'der', type: 'pkcs8' });
const publicBytesOf = (privateKey) => createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).subarray(-32);

async function signIn(apikey, privateKey, address) {
  const message = [`${SIWS_HOST} wants you to sign in with your Solana account:`, address, '', 'Sign in to Itera Hackathon', '', `URI: https://${SIWS_HOST}/login`, 'Version: 1', `Issued At: ${new Date().toISOString()}`].join('\n');
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=web3`, { method: 'POST', headers: { apikey, 'Content-Type': 'application/json' }, body: JSON.stringify({ chain: 'solana', message, signature: sign(null, Buffer.from(message), privateKey).toString('base64url') }) });
  const session = await response.json();
  if (!response.ok || !session.access_token) throw new Error(`sign-in failed: HTTP ${response.status}`);
  return session;
}

async function loadWallet(apikey) {
  const saved = existsSync(WALLET_FILE) ? JSON.parse(readFileSync(WALLET_FILE, 'utf8')) : null;
  const seed = saved ? Buffer.from(saved.seedHex, 'hex') : generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32);
  const privateKey = keyOf(seed);
  const publicBytes = publicBytesOf(privateKey);
  const address = base58Encode(publicBytes);
  if (address === PROTECTED_WALLET) throw new Error('refusing to run with the recording wallet');
  // A fresh session every run: the page refreshes it on its own afterwards.
  const session = await signIn(apikey, privateKey, address);
  const userId = psql(`select user_id from itera.identities where provider_subject = :'subject' limit 1;`, { subject: session.user.id });
  writeFileSync(WALLET_FILE, JSON.stringify({ address, userId, seedHex: seed.toString('hex'), session }, null, 2), { mode: 0o600 });
  psql(`insert into itera.test_accounts (user_id, reason) values (:'u'::uuid, 'e2e demo-e2e.mjs') on conflict do nothing;`, { u: userId });
  log(`${saved ? 'resuming' : 'new'} wallet ${address} · itera user ${userId}`);
  return { address, userId, privateKey, publicBytes, session };
}

/** Runs in the page before any app code: a Phantom that signs through Node. Only what sign-in state and a purchase need. */
function installFakePhantom({ address, publicBytes }) {
  const publicKey = { toBase58: () => address, toString: () => address, toJSON: () => address, toBytes: () => Uint8Array.from(publicBytes), equals: (other) => other?.toBase58?.() === address };
  const listeners = new Map();
  const failure = (code, message) => Object.assign(new Error(message), { code });
  const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
  const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  const send = async (payload, encoding) => {
    const answer = await window.__demoPhantomSend(payload, encoding);
    if (answer.error) throw failure(answer.code ?? -32003, answer.error);
    return { signature: answer.signature, publicKey: address };
  };
  const provider = {
    isPhantom: true,
    publicKey,
    isConnected: true,
    connect: async () => ({ publicKey }),
    disconnect: async () => undefined,
    on: (event, listener) => (listeners.set(event, [...(listeners.get(event) ?? []), listener]), provider),
    off: (event, listener) => (listeners.set(event, (listeners.get(event) ?? []).filter((entry) => entry !== listener)), provider),
    removeListener: (event, listener) => provider.off(event, listener),
    signMessage: async (message) => ({ signature: fromBase64(await window.__demoPhantomSign(toBase64(message), 'base64')), publicKey }),
    signAndSendTransaction: async (transaction) => send(toBase64(transaction.serializeMessage()), 'base64'),
    request: async ({ method, params } = {}) => {
      window.__demoPhantomLog(method);
      if (method === 'connect') return { publicKey };
      if (method === 'disconnect') return undefined;
      if (method === 'signMessage') return provider.signMessage(params?.message);
      if (method === 'signAndSendTransaction') return send(params.message, 'base58');
      throw failure(-32601, `fake Phantom: ${method} is not supported`);
    },
  };
  window.solana = provider;
  window.phantom = { solana: provider };
}

async function openBrowser(wallet) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  const sent = [];
  const decode = (payload, encoding) => (encoding === 'base58' ? base58Decode(payload) : Buffer.from(payload, 'base64'));
  await context.exposeFunction('__demoPhantomLog', (method) => log(`WALLET request:${method}`));
  await context.exposeFunction('__demoPhantomSign', (payload, encoding) => sign(null, decode(payload, encoding), wallet.privateKey).toString('base64'));
  await context.exposeFunction('__demoPhantomSend', async (payload, encoding) => {
    const message = decode(payload, encoding);
    if (message[0] !== 1) return { error: `expected a legacy message with one signer, header byte is ${message[0]}`, code: -32602 };
    const transaction = Buffer.concat([Buffer.from([1]), sign(null, message, wallet.privateKey), message]);
    try {
      const signature = await rpc('sendTransaction', [transaction.toString('base64'), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' }]);
      sent.push(signature);
      log(`WALLET sent ${signature}`);
      return { signature };
    } catch (error) {
      return { error: error.message, code: error.code ?? -32003 };
    }
  });
  await context.addInitScript(installFakePhantom, { address: wallet.address, publicBytes: [...wallet.publicBytes] });
  await context.addInitScript(([key, value]) => {
    try {
      // Written once: afterwards the page owns the session and its refreshes.
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      localStorage.setItem('itera.locale', 'en');
    } catch {
      /* a sandboxed preview frame has no storage */
    }
  }, [`sb-${PROJECT_REF}-auth-token`, JSON.stringify(wallet.session)]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror ${String(error.message).slice(0, 200)}`));
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes('/functions/v1/')) errors.push(`HTTP ${response.status()} ${response.url().split('/functions/v1/')[1].slice(0, 60)}`);
  });
  return { browser, page, sent, errors };
}

// ── 1 + 2: the lesson and its chest ─────────────────────────────────────────────────────────────
async function playLesson(page, wallet, apikey) {
  const activities = JSON.parse(psql(`select json_agg(json_build_object('id', id, 'kind', kind, 'spec', spec) order by ordinal, id) from itera.activities where lesson_id = :'lesson'::uuid and status = 'published';`, { lesson: LESSON_ID }));
  check('Day 1 is 1 concept + 3 exercises: x-ray, multiple choice, connect', activities.map((a) => a.kind).join(',') === 'concept,xray,single_choice,match', activities.map((a) => a.kind).join(','));
  const served = await servedLesson(FUNCTIONS, { apikey, Authorization: `Bearer ${wallet.session.access_token}`, 'Content-Type': 'application/json' }, LESSON_ID);
  const started = Date.now();
  await page.goto(`${BASE}/lesson/${LESSON_ID}`, { waitUntil: 'domcontentloaded' });
  const gate = page.getByTestId('nickname-gate');
  const box = page.getByTestId('lesson-activity');
  await Promise.race([gate.waitFor({ state: 'visible', timeout: 90_000 }).catch(() => {}), box.waitFor({ state: 'visible', timeout: 90_000 }).catch(() => {})]);
  if (await gate.isVisible().catch(() => false)) {
    await page.getByTestId('nickname-input').fill('Demo QA');
    await page.getByTestId('nickname-submit').click();
    await gate.waitFor({ state: 'hidden', timeout: 20_000 });
  }
  const footer = page.getByTestId('feedback-footer');
  const next = page.getByTestId('feedback-footer-continue');
  const verdict = async () => {
    await footer.waitFor({ state: 'visible', timeout: 40_000 });
    return (await footer.getAttribute('data-correct')) === 'true';
  };
  const ceremony = page.getByTestId('stamp-ceremony');
  const redo = page.getByTestId('lesson-redo-missing-cta');
  const missedOnce = new Set();
  for (let guard = 0; guard < 12; guard += 1) {
    await Promise.race([box.waitFor({ state: 'visible', timeout: 60_000 }), ceremony.waitFor({ state: 'visible', timeout: 60_000 }), redo.waitFor({ state: 'visible', timeout: 60_000 })]).catch(() => {});
    if (await ceremony.isVisible().catch(() => false)) break;
    if (await redo.isVisible().catch(() => false)) {
      // A miss on the last exercise: the day says one activity is left, and one button brings it back.
      await shot(page, 'lesson-one-left');
      await redo.click();
      await page.waitForTimeout(800);
      continue;
    }
    const id = await box.getAttribute('data-activity-id');
    const index = activities.findIndex((entry) => entry.id === id);
    const authored = activities[index];
    if (!authored) throw new Error(`unknown activity on screen: ${id}`);
    await page.waitForTimeout(900);
    // A missed exercise found again shows its last answer: "Try again" clears it.
    const again = page.getByTestId('lesson-retry-missed');
    if (await again.isVisible().catch(() => false)) {
      await shot(page, 'lesson-missed-found-again');
      await again.click();
      await page.waitForTimeout(700);
    }
    const spec = resolveSpec(authored.spec, 'en');
    const ids = servedIds({ spec: authored.spec }, served.find((entry) => entry.id === authored.id));
    const dom = (key) => ids.get(key) ?? key;
    await shot(page, `lesson-${index + 1}-${authored.kind}`);
    if (authored.kind === 'concept') {
      await page.getByTestId('concept-continue').click();
    } else if (authored.kind === 'xray') {
      const stage = page.getByTestId('xray-stage');
      await stage.scrollIntoViewIfNeeded();
      const area = await stage.boundingBox();
      for (let row = 0; row < 9; row += 1) {
        const y = area.y + (area.height * (row + 0.5)) / 9;
        const [from, to] = row % 2 === 0 ? [4, area.width - 4] : [area.width - 4, 4];
        await page.mouse.move(area.x + from, y);
        await page.mouse.move(area.x + to, y, { steps: 18 });
      }
      check('x-ray: sweeping the page ends on a right verdict', await verdict());
      await shot(page, 'lesson-2-xray-done');
      await next.click();
    } else if (authored.kind === 'single_choice') {
      await page.locator(`[data-testid="single-choice-option"][data-option-id="${dom(spec.correct_option_id)}"]`).click();
      await page.getByTestId('single-choice-submit').click();
      check('multiple choice: the right option is accepted', await verdict());
      await shot(page, 'lesson-3-choice-done');
      await next.click();
    } else if (authored.kind === 'match') {
      const right = spec.pairs.map((pair) => [pair.left_id, pair.right_id]);
      // The video answers this one wrong first: the first two cards swapped. Skipped when the miss is already on record.
      const miss = !missedOnce.has(id) && psql(`select count(*) from itera.graded_attempts where user_id = :'u'::uuid and activity_id = :'a'::uuid and not passed;`, { u: wallet.userId, a: id }) === '0';
      missedOnce.add(id);
      for (const [left, to] of miss ? [[right[0][0], right[1][1]], [right[1][0], right[0][1]], right[2]] : right) {
        await page.locator(`[data-testid="match-left-card"][data-option-id="${dom(left)}"]`).click();
        await page.locator(`[data-testid="match-right-card"][data-option-id="${dom(to)}"]`).click();
      }
      await page.getByTestId('match-submit').click();
      const correct = await verdict();
      await page.waitForTimeout(700);
      await shot(page, miss ? 'lesson-4-match-wrong' : 'lesson-4-match-right');
      check(miss ? 'connect: a wrong connection is told wrong' : 'connect: answered again, right', miss ? !correct : correct);
      await next.click();
    } else {
      throw new Error(`no handler for ${authored.kind}`);
    }
    await page.locator(`[data-testid="lesson-activity"][data-activity-id="${id}"]`).waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  check('the day is finished in under a minute of robot time', seconds < 60, `${seconds} s from opening the lesson to the last Continue`);

  // 2: the stamp screen of the lesson itself, and the chest on it.
  check('the lesson ends on the stamp screen', await ceremony.waitFor({ state: 'visible', timeout: 60_000 }).then(() => true, () => false));
  const chest = page.getByTestId('day-chest');
  const seen = new Set();
  const chestStarted = Date.now();
  let revealedAt = null;
  for (let wait = 0; wait < 150 && !revealedAt; wait += 1) {
    const phase = await chest.getAttribute('data-phase').catch(() => null);
    if (phase && !seen.has(phase)) {
      seen.add(phase);
      log(`chest ${phase} at +${Math.round((Date.now() - chestStarted) / 100) / 10}s: ${(await chest.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 140)}`);
      await shot(page, `chest-${phase}`);
    }
    if (phase === 'revealed') revealedAt = Date.now();
    else await page.waitForTimeout(600);
  }
  check('the chest is on the stamp screen of the lesson and opens on a Tera', Boolean(revealedAt), `phases ${[...seen].join(' > ')}${revealedAt ? ` · revealed ${Math.round((revealedAt - chestStarted) / 1000)} s after the stamp screen` : ''}`);
  await page.waitForTimeout(1500);
  await shot(page, 'chest-opened');
  const name = (await page.getByTestId('day-chest-name').innerText().catch(() => '')).trim();
  const tier = (await page.getByTestId('day-chest-tier').innerText().catch(() => '')).trim();
  check('the opened chest names the Tera and its tier', Boolean(name && tier), `${tier} · ${name}`);
  const row = psql(`select coalesce(c.status,'') || '|' || coalesce(c.item_key,'') || '|' || coalesce(a.asset_address,'') || '|' || coalesce(a.origin,'') from itera.tera_chests c left join itera.avatar_assets a on a.chest_id = c.id where c.user_id = :'u'::uuid order by c.created_at desc limit 1;`, { u: wallet.userId }).split('|');
  check('database: the chest is minted and its Tera is an earned asset', row[0] === 'minted' && row[3] === 'earned' && Boolean(row[2]), row.join(' · '));
  return { teraKey: row[1], teraAsset: row[2], teraName: name };
}

// ── 3: the world ────────────────────────────────────────────────────────────────────────────────
async function seeWorld(page, earnedKey, label) {
  await page.goto(`${BASE}/world`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('world-collection').waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(1500);
  const cards = await page.locator('[data-testid^="world-tier-"] [data-testid="world-tera"]').evaluateAll((list) => list.map((el) => ({ key: el.getAttribute('data-tera'), hold: el.getAttribute('data-hold'), origin: el.getAttribute('data-origin') })));
  const unlocked = cards.filter((card) => card.hold === 'unlocked');
  const text = await page.getByTestId('world-page').innerText();
  // The first screen of the world already shows what the wallet holds; one link goes down to the cast.
  await shot(page, `world-${label}`);
  await page.getByTestId('world-collection-all').click();
  await page.waitForTimeout(700);
  await shot(page, `world-${label}-cast`);
  const tier = page.locator(`[data-testid^="world-tier-"] [data-testid="world-tera"][data-tera="${earnedKey}"]`);
  if (await tier.count()) {
    await tier.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 160));
    await page.waitForTimeout(500);
    await shot(page, `world-${label}-tier`);
  }
  return { cards, unlocked, text, count: await page.getByTestId('world-collection-count').innerText(), earnedHold: cards.find((card) => card.key === earnedKey) ?? null };
}

// ── 4 + 5: the balance and the purchase ─────────────────────────────────────────────────────────
async function buyTera(page, wallet, sent) {
  await page.goto(`${BASE}/shop`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('shop-arcade').waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(1500);
  const shelfText = await page.getByTestId('shop-page').innerText();
  check('shop: opens on the Teras, priced in SOL, with no "Free" and no "Mint" on the page', (await page.getByTestId('shop-avatars').count()) === 1 && /\d SOL/.test(shelfText) && !/\bfree\b|\bmint/i.test(shelfText), (shelfText.match(/\b(free|mint\w*)\b/gi) ?? []).join(',') || 'clean');
  await shot(page, 'shop-shelf');
  const tile = BUY_KEY ? page.locator(`[data-testid="shop-item"][data-item="${BUY_KEY}"]`) : page.locator('[data-testid="shop-group"][data-group="common"] [data-testid="shop-item"][data-state="buy"]').first();
  await tile.scrollIntoViewIfNeeded();
  await tile.click();
  const key = await tile.getAttribute('data-item');
  await page.waitForTimeout(600);
  const action = page.getByTestId('inspector-action');
  const label = (await action.innerText()).replace(/\s+/g, ' ');
  check('shop: the picked Tera offers one buy button with its SOL price', (await action.getAttribute('data-action')) === 'buy' && /SOL/.test(label), `${key} · ${label}`);
  await shot(page, 'shop-picked');
  const before = BigInt((await rpc('getBalance', [wallet.address, { commitment: 'confirmed' }])).value);
  await action.click();
  const dialog = page.getByTestId('purchase-dialog');
  await dialog.waitFor({ state: 'visible', timeout: 20_000 });
  let phase = null;
  const startedAt = Date.now();
  for (let wait = 0; wait < 120; wait += 1) {
    const now = await dialog.getAttribute('data-phase').catch(() => null);
    if (now !== phase) {
      phase = now;
      log(`purchase ${phase} at +${Math.round((Date.now() - startedAt) / 100) / 10}s`);
      await shot(page, `purchase-${phase}`);
    }
    if (phase === 'paid' || phase === 'failed') break;
    await page.waitForTimeout(500);
  }
  check('purchase: the dialog ends on paid', phase === 'paid', `${phase} · ${(await dialog.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)}`);
  const signature = sent.at(-1) ?? null;
  const row = psql(`select p.status || '|' || coalesce(p.tx_signature,'') || '|' || p.lamports || '|' || coalesce(a.mint_status,'') || '|' || coalesce(a.asset_address,'') || '|' || coalesce(a.origin,'') from itera.purchases p left join itera.avatar_assets a on a.purchase_id = p.id where p.user_id = :'u'::uuid and p.item_key = :'k' order by p.created_at desc limit 1;`, { u: wallet.userId, k: key }).split('|');
  check('database: the purchase is paid with the transaction the wallet sent', row[0] === 'paid' && row[1] === signature, `${row[0]} · ${row[2]} lamports · tx ${row[1]}`);
  const after = BigInt((await rpc('getBalance', [wallet.address, { commitment: 'confirmed' }])).value);
  check('chain: the wallet paid the price and the fee', before - after === BigInt(row[2]) + 5000n, `${before} -> ${after} lamports`);
  // The dialog offers to wear it at once.
  const wear = dialog.getByTestId('purchase-next');
  if (await wear.isVisible().catch(() => false)) await wear.click();
  else await dialog.getByTestId('purchase-done').click().catch(() => {});
  let asset = row[4];
  for (let wait = 0; wait < 30 && row[3] !== 'minted' && !asset; wait += 1) {
    await sleep(2000);
    asset = psql(`select coalesce(asset_address,'') from itera.avatar_assets where user_id = :'u'::uuid and item_key = :'k' and mint_status = 'minted' limit 1;`, { u: wallet.userId, k: key });
  }
  const minted = psql(`select mint_status || '|' || coalesce(asset_address,'') || '|' || coalesce(origin,'') from itera.avatar_assets where user_id = :'u'::uuid and item_key = :'k' limit 1;`, { u: wallet.userId, k: key }).split('|');
  check('database: the bought Tera is a minted asset of origin bought', minted[0] === 'minted' && minted[2] === 'bought' && Boolean(minted[1]), minted.join(' · '));
  return { key, signature, asset: minted[1], lamports: row[2] };
}

// ── main ────────────────────────────────────────────────────────────────────────────────────────
const apikey = await anonKey();
const wallet = await loadWallet(apikey);
const { browser, page, sent, errors } = await openBrowser(wallet);
const report = { base: BASE, wallet: wallet.address, userId: wallet.userId };
try {
  if (STEPS.has(1) || STEPS.has(2)) Object.assign(report, await playLesson(page, wallet, apikey));
  if (!report.teraKey) {
    const [key, asset] = psql(`select coalesce(item_key,'') || '|' || coalesce(asset_address,'') from itera.avatar_assets where user_id = :'u'::uuid and origin = 'earned' order by minted_at desc nulls last limit 1;`, { u: wallet.userId }).split('|');
    Object.assign(report, { teraKey: key, teraAsset: asset });
  }
  if (STEPS.has(3)) {
    const world = await seeWorld(page, report.teraKey, 'after-lesson');
    check('world: the Tera just earned is unlocked and says it was earned', world.earnedHold?.hold === 'unlocked' && world.earnedHold?.origin === 'earned', JSON.stringify(world.earnedHold));
    check('world: every other Tera is locked', world.unlocked.length === 1 && world.cards.length > 40 && world.cards.every((card) => card.hold !== 'open'), `${world.unlocked.length} unlocked of ${world.cards.length} · ${world.count}`);
    check('world: tiers say how a Tera is obtained, and nothing says Free or Mint', /Earn by studying/i.test(world.text) && /Buy in the shop/i.test(world.text) && !/\bfree\b|\bmint/i.test(world.text), (world.text.match(/\b(free|mint\w*)\b/gi) ?? []).join(',') || 'clean');
  }
  if (STEPS.has(4)) {
    const held = BigInt((await rpc('getBalance', [wallet.address, { commitment: 'confirmed' }])).value);
    if (held < FUND_LAMPORTS) {
      const signature = await fund(loadAuthority(), wallet.address, FUND_LAMPORTS - held);
      log(`funded the throwaway wallet with ${FUND_LAMPORTS - held} lamports: ${signature}`);
      await sleep(3000);
    }
    const lamports = (await rpc('getBalance', [wallet.address, { commitment: 'confirmed' }])).value;
    await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
    const card = page.locator('[data-testid="wallet-balance"][data-variant="card"]');
    await card.waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="wallet-balance"]')?.getAttribute('data-lamports'), null, { timeout: 30_000 }).catch(() => {});
    const shown = await card.getAttribute('data-lamports');
    const amount = (await card.getByTestId('wallet-balance-amount').innerText()).trim();
    check('profile: the wallet balance on screen is the balance on chain, in SOL', shown === String(lamports) && /SOL$/.test(amount), `${amount} · ${shown} lamports on screen · ${lamports} on chain`);
    report.balanceBefore = amount;
    await page.waitForTimeout(1500);
    await shot(page, 'profile-balance');
  }
  if (STEPS.has(5)) {
    report.purchase = await buyTera(page, wallet, sent);
    report.purchase.explorer = `https://explorer.solana.com/tx/${report.purchase.signature}?cluster=devnet`;
    await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
    const picker = page.getByTestId('avatar-picker');
    await picker.waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(2500);
    const worn = psql(`select coalesce(avatar,'') from itera.companions where user_id = :'u'::uuid;`, { u: wallet.userId });
    check('profile: the bought Tera is the avatar worn', worn === report.purchase.key, `companions.avatar = ${worn}`);
    const header = await page.locator('header img, [data-testid="app-top-bar"] img').evaluateAll((list) => list.map((img) => img.getAttribute('src') ?? '')).catch(() => []);
    check('header: the picture is the bought Tera', header.some((src) => src.includes(report.purchase.key)), header.filter((src) => /tera-avatars/.test(src)).map((src) => src.split('/').pop()).join(','));
    report.balanceAfter = (await page.locator('[data-testid="wallet-balance"][data-variant="card"]').getByTestId('wallet-balance-amount').innerText().catch(() => '')).trim();
    await shot(page, 'profile-wearing-bought');
    await picker.scrollIntoViewIfNeeded();
    await shot(page, 'profile-picker');
  }
  if (STEPS.has(6)) {
    const bought = report.purchase?.key ?? psql(`select coalesce(item_key,'') from itera.avatar_assets where user_id = :'u'::uuid and origin = 'bought' and mint_status = 'minted' order by minted_at desc limit 1;`, { u: wallet.userId });
    const world = await seeWorld(page, bought, 'after-purchase');
    check('world: the bought Tera is unlocked too and says it was bought', world.earnedHold?.hold === 'unlocked' && world.earnedHold?.origin === 'bought' && world.unlocked.length === 2, `${JSON.stringify(world.earnedHold)} · ${world.count}`);
  }
} catch (error) {
  check('the run reached its end', false, error.message);
  await shot(page, 'stopped-here');
} finally {
  await browser.close();
}
report.pageErrors = [...new Set(errors)];
report.checks = results;
writeFileSync(`${OUT}/result.json`, JSON.stringify(report, null, 2));
const failed = results.filter((entry) => !entry.pass);
log(`${results.length - failed.length}/${results.length} checks passed${report.purchase?.explorer ? ` · purchase ${report.purchase.explorer}` : ''}`);
if (report.pageErrors.length) log(`page errors: ${report.pageErrors.slice(0, 8).join(' | ')}`);
process.exit(failed.length ? 1 : 0);
