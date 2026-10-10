#!/usr/bin/env node
// Browser proof of the invite reward and of "gift a life", with two throwaway wallet learners and
// the fake Phantom of browser-e2e.mjs. Devnet only; meant for a local dev server on an origin the
// auth allow-list accepts.
//
//   node scripts/hackathon/gift-browser.mjs --base http://localhost:8080 --out /tmp/hk-gift
//
// Environment (source ~/.config/itera-hackathon/supabase.env): HACKATHON_DB_PASSWORD, and the
// authority keyfile (~/.config/itera-hackathon/devnet-authority.json) to fund the paying wallet.
// Leaves two throwaway users behind. See docs/browser-e2e.md for the harness.
import { execFileSync } from 'node:child_process';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { buildTransferMessage } from '../../supabase/functions/_shared/solana-tx.ts';
import { base58Decode, base58Encode, installFakePhantom } from './browser-e2e.mjs';

const PROJECT_REF = 'nyzcbnnbffsizshiolbh';
const FUNCTIONS = `https://${PROJECT_REF}.supabase.co/functions/v1`;
const DB_URL = `postgresql://postgres.${PROJECT_REF}@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require`;
const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const PROTECTED_WALLET = 'CQziGuEV4i8yGBHwQQJMpe6tACSMR5jWUWjmYSGVDAhW';
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const BASE = option('base', 'http://localhost:8080').replace(/\/$/, '');
const OUT = option('out', '/tmp/hk-gift');

const checks = [];
let shot = 0;
function check(name, pass, detail = '') {
  checks.push({ name, pass: Boolean(pass), detail: String(detail).slice(0, 200) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 200)})` : ''}`);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function psql(sql, variables = {}) {
  const cli = [DB_URL, '-X', '-At', '-v', 'ON_ERROR_STOP=1'];
  for (const [name, value] of Object.entries(variables)) cli.push('-v', `${name}=${value}`);
  return execFileSync('psql', cli, { input: sql, encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env.HACKATHON_DB_PASSWORD } }).trim();
}

async function rpc(method, params) {
  const response = await fetch(RPC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const payload = await response.json();
  if (payload.error) throw Object.assign(new Error(`${method}: ${payload.error.message}`), { code: payload.error.code });
  return payload.result;
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

function newWallet() {
  const { privateKey } = generateKeyPairSync('ed25519');
  const publicBytes = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).subarray(-32);
  const address = base58Encode(publicBytes);
  if (address === PROTECTED_WALLET) throw new Error('refusing the protected wallet');
  return { privateKey, publicBytes, address };
}

async function sendSigned(privateKey, message) {
  const signature = sign(null, Buffer.from(message), privateKey);
  return rpc('sendTransaction', [Buffer.concat([Buffer.from([1]), signature, Buffer.from(message)]).toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
}

async function fundFromAuthority(recipient, lamports) {
  const secret = Uint8Array.from(JSON.parse(readFileSync(process.env.HACKATHON_AUTHORITY_KEYFILE ?? `${homedir()}/.config/itera-hackathon/devnet-authority.json`, 'utf8')));
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(secret.slice(0, 32))]), format: 'der', type: 'pkcs8' });
  const { blockhash } = (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
  const signature = await sendSigned(privateKey, buildTransferMessage({ payer: base58Encode(secret.slice(32)), recipient, lamports, memo: 'gift-browser: funding', recentBlockhash: blockhash }));
  await until(async () => (await rpc('getBalance', [recipient, { commitment: 'confirmed' }])).value, (value) => value >= Number(lamports), 30, 1000);
  return signature;
}

/** One learner: a browser context with its own fake Phantom. */
async function newLearner(browser, label) {
  const wallet = newWallet();
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', permissions: ['clipboard-read', 'clipboard-write'] });
  const decode = (payload, encoding) => (encoding === 'base58' ? base58Decode(payload) : Buffer.from(payload, 'base64'));
  await context.exposeFunction('__fakePhantomLog', () => {});
  await context.exposeFunction('__fakePhantomSign', (payload, encoding) => sign(null, decode(payload, encoding), wallet.privateKey).toString('base64'));
  await context.exposeFunction('__fakePhantomSignAndSend', async (payload, encoding) => {
    try {
      return { signature: await sendSigned(wallet.privateKey, decode(payload, encoding)) };
    } catch (error) {
      return { error: error.message, code: error.code ?? -32003 };
    }
  });
  await context.addInitScript(installFakePhantom, { address: wallet.address, publicBytes: [...wallet.publicBytes] });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message).slice(0, 200)));
  console.log(`${label}: wallet ${wallet.address}`);
  return { label, wallet, context, page, errors, userId: null };
}

const tid = (page, id) => page.getByTestId(id);
const visible = (locator, timeout = 1500) => locator.first().waitFor({ state: 'visible', timeout }).then(() => true, () => false);

async function snap(page, name) {
  for (const [suffix, viewport] of [['', DESKTOP], ['-mobile', MOBILE]]) {
    await page.setViewportSize(viewport);
    await sleep(500);
    shot += 1;
    await page.screenshot({ path: join(OUT, `${String(shot).padStart(2, '0')}-${name}${suffix}.png`) });
  }
  await page.setViewportSize(DESKTOP);
}

const userOf = (wallet) =>
  psql(
    `select i.user_id from auth.identities a join itera.identities i on i.provider_subject = a.user_id::text
     where a.provider = 'web3' and a.identity_data -> 'custom_claims' ->> 'address' = :'wallet' limit 1;`,
    { wallet },
  );
const companionOf = (userId) => {
  const [lives, mint, asset] = psql(`select lives, mint_status, coalesce(asset_address, '') from itera.companions where user_id = :'id'::uuid;`, { id: userId }).split('|');
  return { lives: Number(lives), mint, asset };
};
const medalOf = (userId, key) => psql(`select mint_status || '|' || coalesce(asset_address, '') from itera.user_achievements where user_id = :'id'::uuid and achievement_key = :'key' limit 1;`, { id: userId, key }).split('|');
async function chainLives(asset, wanted) {
  const read = async () => Number(((await (await fetch(`${FUNCTIONS}/credential-verify/${asset}?t=${Date.now()}`)).json()).attributes ?? []).find(({ key }) => key === 'lives')?.value);
  return until(read, (lives) => lives === wanted, 30, 1500);
}

async function signIn(learner, path, nickname) {
  const { page } = learner;
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  if (!page.url().includes('/login')) await page.waitForURL(/\/login/, { timeout: 20_000 }).catch(() => page.goto(`${BASE}/login`));
  await tid(page, 'web3-solana').waitFor({ state: 'visible', timeout: 30_000 });
  await tid(page, 'web3-solana').click();
  await page.waitForFunction(() => !location.pathname.startsWith('/login') && Object.keys(localStorage).some((key) => key.startsWith('sb-') && key.endsWith('-auth-token')), null, { timeout: 30_000 });
  learner.userId = await until(() => userOf(learner.wallet.address), Boolean, 20, 1000);
  if (await visible(tid(page, 'nickname-gate'), 15_000)) {
    await tid(page, 'nickname-input').fill(nickname);
    await tid(page, 'nickname-submit').click();
    await tid(page, 'nickname-gate').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
  }
  console.log(`${learner.label}: itera user ${learner.userId}`);
}

/** Day 1 of the first trail: every published activity but the closing reveal completed twenty minutes ago. */
function seedFirstDay(userId) {
  const rows = psql(
    `select l.id, a.id, a.kind from itera.programs p join itera.units u on u.program_id = p.id join itera.lessons l on l.unit_id = u.id
     join itera.activities a on a.lesson_id = l.id and a.status = 'published'
     where p.slug = 'itera-v2' and u.ordinal = 0 and l.ordinal = (select min(ordinal) from itera.lessons where unit_id = u.id)
     order by a.ordinal, a.id;`,
  ).split('\n').map((line) => line.split('|'));
  const lessonId = rows[0][0];
  const open = rows.at(-1);
  psql(
    `with seed as (select unnest(string_to_array(:'done', ',')::uuid[]) as activity_id), wrote as (
       insert into itera.progress (user_id, activity_id, status, completed_at)
       select :'id'::uuid, activity_id, 'completed', now() - interval '20 minutes' from seed
       on conflict (user_id, activity_id) do update set status = 'completed', completed_at = excluded.completed_at returning activity_id)
     insert into itera.xp_events (user_id, tenant_id, amount, reason, created_at)
     select :'id'::uuid, (select tenant_id from itera.memberships where user_id = :'id'::uuid limit 1), 10, 'activity_complete:' || activity_id, now() - interval '20 minutes' from seed;`,
    { id: userId, done: rows.slice(0, -1).map((row) => row[1]).join(',') },
  );
  return { lessonId, openKind: open[2], seeded: rows.length - 1 };
}

async function finishLesson(page, lessonId) {
  await page.goto(`${BASE}/lesson/${lessonId}`, { waitUntil: 'domcontentloaded' });
  await tid(page, 'lesson-activity').waitFor({ timeout: 30_000 });
  await sleep(1500);
  for (let round = 0; round < 24 && !(await visible(tid(page, 'stamp-ceremony'), 700)); round += 1) {
    if (await visible(tid(page, 'concept-continue'), 300)) {
      if (await visible(tid(page, 'concept-reveal-show'), 300)) await tid(page, 'concept-reveal-show').click();
      await sleep(400);
      await tid(page, 'concept-continue').click();
    } else if (await visible(tid(page, 'lesson-complete'), 300)) {
      await sleep(1500);
    } else if (await tid(page, 'lesson-next').isEnabled().catch(() => false)) {
      await tid(page, 'lesson-next').click();
    }
    await sleep(800);
  }
  return visible(tid(page, 'stamp-ceremony'), 30_000);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const inviter = await newLearner(browser, 'user 1 (inviter, recipient)');
  const invited = await newLearner(browser, 'user 2 (invited, payer)');
  try {
    // --- user 1 copies the invite link -------------------------------------------------------
    await signIn(inviter, '/login', 'Ana QA');
    const inviterCompanion = await until(() => companionOf(inviter.userId), (row) => row.mint === 'minted', 60, 1500);
    check('user 1: companion minted', inviterCompanion.mint === 'minted', inviterCompanion.asset);
    await inviter.page.goto(`${BASE}/shop`, { waitUntil: 'domcontentloaded' });
    await tid(inviter.page, 'invite-card').waitFor({ timeout: 30_000 });
    await tid(inviter.page, 'invite-card').scrollIntoViewIfNeeded();
    await snap(inviter.page, 'shop-invite-card');
    await tid(inviter.page, 'invite-card').getByRole('button').click();
    const link = await inviter.page.evaluate(() => navigator.clipboard.readText());
    const code = psql(`select code from itera.referral_codes where user_id = :'id'::uuid;`, { id: inviter.userId });
    check('user 1: "Copiar convite" copies /?ref=<code>, a short code that is not the wallet', link === `${BASE}/?ref=${code}` && /^[a-z0-9]{6,12}$/.test(code), link);
    check('user 1: the card says nobody was invited yet', (await tid(inviter.page, 'invite-count').getAttribute('data-rewarded')) === '0');

    // --- user 2 lands with ?ref, signs in, finishes a first day ------------------------------
    await signIn(invited, new URL(link).pathname + new URL(link).search, 'Beto QA');
    const referral = await until(() => psql(`select status from itera.referrals where invited_user_id = :'id'::uuid;`, { id: invited.userId }), Boolean, 20, 1000);
    check('user 2: the invite survived sign-in and was claimed once (pending)', referral === 'pending', referral);
    check('user 2: the stored code was cleared after the claim', (await invited.page.evaluate(() => localStorage.getItem('itera.ref'))) === null);
    await fundFromAuthority(invited.wallet.address, 4_000_000n);
    const invitedCompanion = await until(() => companionOf(invited.userId), (row) => row.mint === 'minted', 60, 1500);
    check('user 2: companion minted', invitedCompanion.mint === 'minted', invitedCompanion.asset);
    const day = seedFirstDay(invited.userId);
    console.log(`seeded ${day.seeded} activities of day 1; open: ${day.openKind}`);
    const ceremony = await finishLesson(invited.page, day.lessonId);
    check('user 2: finishing the last activity opens the stamp ceremony', ceremony);
    await sleep(12_000);
    await snap(invited.page, 'first-day-ceremony');

    const rewarded = await until(() => psql(`select status from itera.referrals where invited_user_id = :'id'::uuid;`, { id: invited.userId }), (value) => value === 'rewarded', 30, 1500);
    check('reward: the referral is rewarded in the database', rewarded === 'rewarded', rewarded);
    check('reward: both have 6/5 lives in the database', companionOf(inviter.userId).lives === 6 && companionOf(invited.userId).lives === 6, `${companionOf(inviter.userId).lives} / ${companionOf(invited.userId).lives}`);
    const invitedMedal = await until(async () => medalOf(invited.userId, 'invited'), ([state]) => state === 'minted', 40, 2000);
    const inviterMedal = await until(async () => medalOf(inviter.userId, 'friend_brought'), ([state]) => state === 'minted', 40, 2000);
    check('reward: both medals are minted', invitedMedal[0] === 'minted' && inviterMedal[0] === 'minted', `${invitedMedal.join(' ')} · ${inviterMedal.join(' ')}`);
    check('reward: both companions say 6 lives on chain', (await chainLives(inviterCompanion.asset, 6)) === 6 && (await chainLives(invitedCompanion.asset, 6)) === 6);

    await invited.page.goto(`${BASE}/passport`, { waitUntil: 'domcontentloaded' });
    await tid(invited.page, 'medal-shelf').first().waitFor({ timeout: 30_000 });
    await invited.page.waitForLoadState('networkidle').catch(() => {});
    await sleep(2500);
    const shelf = await invited.page.locator('[data-testid="medal-shelf"]').first().innerText();
    check('user 2: the medal shelf shows "Chegou por convite"', /Chegou por convite/.test(shelf) && /Trouxe um amigo/.test(shelf), shelf.replace(/\s+/g, ' ').slice(0, 160));
    await tid(invited.page, 'medal-shelf').first().scrollIntoViewIfNeeded();
    await snap(invited.page, 'invited-medal-shelf');

    await inviter.page.goto(`${BASE}/shop`, { waitUntil: 'domcontentloaded' });
    await tid(inviter.page, 'invite-card').waitFor({ timeout: 30_000 });
    await sleep(2000);
    check('user 1: the invite card counts one friend brought', (await tid(inviter.page, 'invite-count').getAttribute('data-rewarded')) === '1', await tid(inviter.page, 'invite-count').innerText());
    check('user 1: the shop shows the bonus life (6/5)', (await tid(inviter.page, 'shop-lives-count').innerText()).trim() === '6/5' && (await inviter.page.locator('[data-testid="shop-stage"] [data-bonus]').count()) === 1);
    await snap(inviter.page, 'inviter-shop-rewarded');
    await inviter.page.goto(`${BASE}/u/${inviter.wallet.address}`, { waitUntil: 'domcontentloaded' });
    await tid(inviter.page, 'profile-medals').waitFor({ timeout: 40_000 });
    await sleep(2500);
    check('user 1: the public profile lists "Trouxe um amigo" and offers the invite and gift links', /Trouxe um amigo/.test(await tid(inviter.page, 'profile-medals').innerText()) && (await tid(inviter.page, 'profile-gift').getByRole('button').count()) === 2 && (await tid(inviter.page, 'gift-button').count()) === 0);
    await snap(inviter.page, 'inviter-profile-own');

    // --- user 2 gifts a life on user 1's profile ---------------------------------------------
    psql(`update itera.companions set lives = 3, last_regen_at = now(), version = version + 1 where user_id = :'id'::uuid;`, { id: inviter.userId });
    await invited.page.goto(`${BASE}/u/${inviter.wallet.address}`, { waitUntil: 'domcontentloaded' });
    await tid(invited.page, 'gift-button').waitFor({ timeout: 40_000 });
    await invited.page.waitForFunction(() => /SOL/.test(document.querySelector('[data-testid="gift-button"]')?.textContent ?? ''), null, { timeout: 20_000 }).catch(() => {});
    const buttonText = (await tid(invited.page, 'gift-button').innerText()).trim();
    check('user 2: the profile shows "Dar uma vida · US$ 0.10 ≈ 0.00055 SOL"', buttonText === 'Dar uma vida · US$ 0.10 ≈ 0.00055 SOL', buttonText);
    await snap(invited.page, 'profile-gift-button');
    await tid(invited.page, 'profile-gift').getByRole('button', { name: 'Copiar link de presente' }).click();
    const blink = await invited.page.evaluate(() => navigator.clipboard.readText());
    check('user 2: "Copiar link de presente" copies the dial.to blink of this recipient', blink.startsWith('https://dial.to/?action=solana-action') && decodeURIComponent(blink).includes(`action-gift?to=${inviter.wallet.address}`) && blink.endsWith('&cluster=devnet'), blink);
    await tid(invited.page, 'gift-button').click();
    const dialog = tid(invited.page, 'purchase-dialog');
    const phase = await until(() => dialog.getAttribute('data-phase').catch(() => null), (value) => ['paid', 'failed', 'insufficient', 'no_wallet'].includes(value), 120, 500);
    const dialogText = (await dialog.innerText().catch(() => '')).replace(/\s+/g, ' ');
    check('user 2: the success moment says "Você deu uma vida pro Ana QA" with both explorer links', phase === 'paid' && /Você deu uma vida pro Ana QA/.test(dialogText) && (await tid(invited.page, 'purchase-explorer').count()) === 1 && (await tid(invited.page, 'purchase-chain-explorer').count()) === 1, `${phase}: ${dialogText.slice(0, 160)}`);
    await snap(invited.page, 'gift-paid');
    const gift = psql(`select status || '|' || coalesce(tx_signature, '') || '|' || coalesce(mirror_signature, '') from itera.gifts where to_user_id = :'id'::uuid order by created_at desc limit 1;`, { id: inviter.userId }).split('|');
    check('gift: delivered in the database with the payment and the companion write', gift[0] === 'delivered' && gift[1].length > 60 && gift[2].length > 60 && companionOf(inviter.userId).lives === 4, gift[0]);
    check('gift: the links in the dialog are those two transactions', (await tid(invited.page, 'purchase-explorer').getAttribute('href')).includes(gift[1]) && (await tid(invited.page, 'purchase-chain-explorer').getAttribute('href')).includes(gift[2]));
    check('gift: user 1\'s companion says 4 lives on chain', (await chainLives(inviterCompanion.asset, 4)) === 4);
    await tid(invited.page, 'purchase-done').click();

    await invited.page.goto(`${BASE}/gift/${inviter.wallet.address}`, { waitUntil: 'domcontentloaded' });
    await tid(invited.page, 'gift-card').waitFor({ timeout: 40_000 });
    await sleep(2500);
    check('gift page: shows the recipient\'s Tera and the same gift button', (await tid(invited.page, 'gift-art').count()) === 1 && (await tid(invited.page, 'gift-button').count()) === 1);
    await snap(invited.page, 'gift-page');

    // --- user 1 sees the moment the next time the app loads ----------------------------------
    await inviter.page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const moment = await visible(tid(inviter.page, 'gift-moment'), 30_000);
    const title = moment ? (await tid(inviter.page, 'gift-moment-title').innerText()).trim() : '';
    check('user 1: "Beto QA te deu uma vida!" on the next load', title === 'Beto QA te deu uma vida!', title);
    await sleep(1200);
    await snap(inviter.page, 'gift-moment');
    await tid(inviter.page, 'gift-moment-done').click();
    const seen = await until(() => psql(`select count(*) from itera.gifts where to_user_id = :'id'::uuid and seen_at is not null;`, { id: inviter.userId }), (value) => value === '1', 10, 1000);
    check('user 1: closing it stores `seen_at`, and it does not come back', seen === '1' && !(await inviter.page.reload().then(() => visible(tid(inviter.page, 'gift-moment'), 6000))));
    check('no uncaught page errors in either browser', inviter.errors.length + invited.errors.length === 0, [...inviter.errors, ...invited.errors].join(' | '));
    console.log(`\nblink for user 1: ${blink}\nprofile: ${BASE}/u/${inviter.wallet.address}`);
  } catch (error) {
    check('run completed without an exception', false, error.stack?.split('\n').slice(0, 3).join(' | '));
    await inviter.page.screenshot({ path: join(OUT, 'crash-user1.png') }).catch(() => {});
    await invited.page.screenshot({ path: join(OUT, 'crash-user2.png') }).catch(() => {});
  } finally {
    writeFileSync(join(OUT, 'results.json'), JSON.stringify({ base: BASE, inviter: inviter.wallet.address, invited: invited.wallet.address, checks }, null, 2));
    await browser.close();
  }
  const failed = checks.filter((entry) => !entry.pass).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed · screenshots in ${OUT}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('gift-browser failed:', error);
  process.exit(1);
});
