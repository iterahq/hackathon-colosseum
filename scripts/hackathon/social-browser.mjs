#!/usr/bin/env node
// Browser proof of the social on-chain features with the fake Phantom of browser-e2e.mjs: a learner
// claims and wears the laurel at level 5; an instructor records a class podium and the learner sees
// the medal; the instructor endorses the learner's certification and `/c/<asset>` shows it; a
// purchase shows the Circuito line and strip. Devnet only, against a local dev server.
//
//   node scripts/hackathon/social-browser.mjs --base http://localhost:8080 --out /tmp/hk-social
//
// Environment (source ~/.config/itera-hackathon/supabase.env): HACKATHON_DB_PASSWORD, and the
// authority keyfile to fund the paying wallet. Leaves two throwaway wallet users behind.
import { createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { base58Decode, base58Encode, installFakePhantom } from './browser-e2e.mjs';
import { bareUser, buildSession } from './social-e2e.podium.mjs';
import { FUNCTIONS, PROTECTED_WALLET, balance, check, fund, loadAuthority, makeTenant, psql, rpc, seedXp, sleep, sol, summary, until } from './social-e2e.lib.mjs';

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const BASE = option('base', 'http://localhost:8080').replace(/\/$/, '');
const OUT = option('out', '/tmp/hk-social');
let shot = Number(option('shot-start', '0'));

async function sendSigned(privateKey, message) {
  const signature = sign(null, Buffer.from(message), privateKey);
  return rpc('sendTransaction', [Buffer.concat([Buffer.from([1]), signature, Buffer.from(message)]).toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
}

/** One person: a browser context with its own fake Phantom. */
async function newPerson(browser, label) {
  const { privateKey } = generateKeyPairSync('ed25519');
  const publicBytes = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).subarray(-32);
  const address = base58Encode(publicBytes);
  if (address === PROTECTED_WALLET) throw new Error('refusing the protected wallet');
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const decode = (payload, encoding) => (encoding === 'base58' ? base58Decode(payload) : Buffer.from(payload, 'base64'));
  await context.exposeFunction('__fakePhantomLog', () => {});
  await context.exposeFunction('__fakePhantomSign', (payload, encoding) => sign(null, decode(payload, encoding), privateKey).toString('base64'));
  await context.exposeFunction('__fakePhantomSignAndSend', async (payload, encoding) => {
    try {
      return { signature: await sendSigned(privateKey, decode(payload, encoding)) };
    } catch (error) {
      return { error: error.message, code: error.code ?? -32003 };
    }
  });
  await context.addInitScript(installFakePhantom, { address, publicBytes: [...publicBytes] });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message).slice(0, 200)));
  console.log(`${label}: wallet ${address}`);
  return { label, address, privateKey, context, page, errors, userId: null };
}

const tid = (page, id) => page.getByTestId(id);
const visible = (locator, timeout = 1500) => locator.first().waitFor({ state: 'visible', timeout }).then(() => true, () => false);

async function snap(page, name, { fullPage = false, focus = null } = {}) {
  for (const [suffix, viewport] of [['', DESKTOP], ['-mobile', MOBILE]]) {
    await page.setViewportSize(viewport);
    await sleep(600);
    // The layout changes with the viewport: bring the subject back into view for each one.
    if (focus) await focus.evaluate((element) => element.scrollIntoView({ block: 'center' })).catch(() => {});
    await sleep(300);
    shot += 1;
    await page.screenshot({ path: join(OUT, `${String(shot).padStart(2, '0')}-${name}${suffix}.png`), fullPage });
  }
  await page.setViewportSize(DESKTOP);
}

const userOf = (wallet) =>
  psql(
    `select i.user_id from auth.identities a join itera.identities i on i.provider_subject = a.user_id::text
     where a.provider = 'web3' and a.identity_data -> 'custom_claims' ->> 'address' = :'wallet' limit 1;`,
    { wallet },
  );

async function signIn(person, nickname) {
  const { page } = person;
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await tid(page, 'web3-solana').waitFor({ state: 'visible', timeout: 40_000 });
  await tid(page, 'web3-solana').click();
  await page.waitForFunction(() => !location.pathname.startsWith('/login') && Object.keys(localStorage).some((key) => key.startsWith('sb-') && key.endsWith('-auth-token')), null, { timeout: 40_000 });
  person.userId = await until(() => userOf(person.address), Boolean, 20, 1000);
  if (await visible(tid(page, 'nickname-gate'), 15_000)) {
    await tid(page, 'nickname-input').fill(nickname);
    await tid(page, 'nickname-submit').click();
    await tid(page, 'nickname-gate').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
  }
  console.log(`${person.label}: itera user ${person.userId}`);
}

/** Calls an edge function as the signed-in person, with the session the app itself holds. */
const callAs = (person, name, body) =>
  person.page.evaluate(
    async ({ url, payload }) => {
      const key = Object.keys(localStorage).find((entry) => entry.startsWith('sb-') && entry.endsWith('-auth-token'));
      const token = JSON.parse(localStorage.getItem(key)).access_token;
      const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      return response.json();
    },
    { url: `${FUNCTIONS}/${name}`, payload: body },
  );

const shopCard = (page, key) => page.locator(`[data-testid="shop-item"][data-item="${key}"]`);

async function laurel(learner) {
  const { page } = learner;
  seedXp(learner.userId, 450);
  await page.goto(`${BASE}/shop`, { waitUntil: 'domcontentloaded' });
  const card = shopCard(page, 'outfit_laurel');
  await card.waitFor({ timeout: 40_000 });
  await card.scrollIntoViewIfNeeded();
  const locked = await card.getByTestId('shop-unlock').innerText();
  check('laurel card below the level: progress line and the usual buy button', /Nível 3 de 5 para liberar · ou compre agora/.test(locked) && (await visible(card.getByTestId('shop-buy'))) && !(await visible(card.getByTestId('shop-claim'), 300)), locked);
  await snap(page, 'laurel-level3', { focus: card });

  seedXp(learner.userId, 350);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await card.getByTestId('shop-claim').waitFor({ timeout: 40_000 });
  await card.scrollIntoViewIfNeeded();
  check('laurel card at level 5: "Resgatar" replaces the price', (await card.getByTestId('shop-claim').innerText()).trim() === 'Resgatar' && !(await visible(card.getByTestId('shop-price'), 300)), await card.getByTestId('shop-unlock').innerText());
  await snap(page, 'laurel-unlocked', { focus: card });
  await card.getByTestId('shop-claim').click();
  await card.getByTestId('shop-equip').waitFor({ timeout: 20_000 });
  check('after the claim the card offers the same equip action as a bought outfit', (await card.getAttribute('data-state')) === 'owned');
  check('database: the claim is a paid purchase of zero lamports and one inventory row', psql(`select count(*) || '|' || max(lamports) from itera.purchases where user_id = :'id'::uuid and source = 'claim';`, { id: learner.userId }) === '1|0' && psql(`select qty from itera.user_inventory where user_id = :'id'::uuid and item_key = 'outfit_laurel';`, { id: learner.userId }) === '1');
  await card.getByTestId('shop-equip').click();
  await card.getByTestId('shop-unequip').waitFor({ timeout: 20_000 });
  const worn = await until(async () => psql(`select coalesce(outfit, '') from itera.companions where user_id = :'id'::uuid;`, { id: learner.userId }), (outfit) => outfit === 'outfit_laurel', 10, 1000);
  check('equipped: the card says so and the companion wears the laurel', (await card.getAttribute('data-state')) === 'equipped' && worn === 'outfit_laurel', `${await card.getAttribute('data-state')} ${worn}`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await snap(page, 'laurel-equipped');
  await snap(page, 'laurel-card-equipped', { focus: card });
}

async function podium(instructor, learner, tenantId) {
  const second = bareUser('browser-2nd');
  const third = bareUser('browser-3rd');
  for (const id of [second, third]) psql(`insert into itera.memberships (user_id, tenant_id, role) values (:'user_id'::uuid, :'tenant'::uuid, 'learner');`, { user_id: id, tenant: tenantId });
  const { session } = buildSession({ tenantId, instructorId: instructor.userId, scores: [[learner.userId, 3, 0, 900], [second, 2, 1, 900], [third, 1, 2, 900]] });

  const { page } = instructor;
  await page.goto(`${BASE}/live/instructor/report/${session}`, { waitUntil: 'domcontentloaded' });
  await tid(page, 'report-podium-record').waitFor({ timeout: 40_000 });
  await tid(page, 'report-podium-chain').scrollIntoViewIfNeeded();
  check('instructor report: ranking and the "Gravar pódio na Solana" button', (await tid(page, 'report-podium-record').innerText()).trim() === 'Gravar pódio na Solana' && (await visible(tid(page, 'report-ranking'))));
  await snap(page, 'report-before', { fullPage: true });
  await tid(page, 'report-podium-record').click();
  await tid(page, 'report-podium-result').waitFor({ timeout: 90_000 });
  const result = await tid(page, 'report-podium-result').innerText();
  const minted = await page.locator('[data-testid="report-podium-result"] li[data-status="minted"] a').first().getAttribute('href').catch(() => null);
  check('result list: three places, the wallet learner minted with an explorer link, the others waiting for a wallet', /1º/.test(result) && /Medalha na Solana/.test(result) && /Sem carteira/.test(result) && /explorer\.solana\.com\/address\//.test(minted ?? ''), result.replace(/\s+/g, ' ').slice(0, 180));
  await tid(page, 'report-podium-chain').scrollIntoViewIfNeeded();
  await snap(page, 'report-recorded', { fullPage: true });

  const medal = await until(async () => psql(`select mint_status || '|' || coalesce(asset_address, '') from itera.user_achievements where user_id = :'id'::uuid and achievement_key = 'podium_1';`, { id: learner.userId }).split('|'), ([state]) => state === 'minted', 20, 1500);
  check('database: the learner holds a minted podium_1 medal', medal[0] === 'minted' && medal[1]);

  await learner.page.goto(`${BASE}/passport`, { waitUntil: 'domcontentloaded' });
  await tid(learner.page, 'medal-shelf').first().waitFor({ timeout: 40_000 });
  const shelf = learner.page.locator('[data-testid="passport-medal"][data-earned="true"]');
  await shelf.first().waitFor({ timeout: 20_000 });
  const shelfText = await tid(learner.page, 'medal-shelf').first().innerText();
  check('learner: the medal is on the shelf', /1º lugar na aula ao vivo/.test(shelfText), shelfText.replace(/\s+/g, ' ').slice(0, 160));
  await tid(learner.page, 'medal-shelf').first().scrollIntoViewIfNeeded();
  await sleep(1500);
  await snap(learner.page, 'learner-shelf', { focus: tid(learner.page, 'medal-shelf').first() });

  await learner.page.goto(`${BASE}/u/${learner.address}`, { waitUntil: 'domcontentloaded' });
  await tid(learner.page, 'profile-band').waitFor({ timeout: 40_000 });
  await sleep(2500);
  check('learner: the medal is on the public profile', /1º lugar na aula ao vivo/.test(await learner.page.locator('main').innerText()));
  await snap(learner.page, 'learner-profile', { fullPage: true });

  await learner.page.goto(`${BASE}/live/${session}`, { waitUntil: 'domcontentloaded' });
  const ended = await visible(tid(learner.page, 'live-ended'), 30_000);
  const onChain = ended && (await visible(tid(learner.page, 'live-podium-onchain'), 15_000));
  // The podium screen ranks the people the live room saw (realtime presence): a session seeded as rows has
  // nobody on it, so the mark can only show in a class that was really run. Its rendering is unit-tested.
  const places = ended ? await learner.page.getByTestId('live-podium-place').count() : 0;
  if (places > 0) check('learner podium screen: "medalha on-chain" under the name', onChain);
  else console.log('NOTE  learner podium screen: no ranking on screen for a seeded session; "medalha on-chain" not exercised here');
  await snap(learner.page, 'learner-podium');
  return session;
}

async function endorsement(instructor, learner) {
  // The learner's first day, whole, then the app's own passport call mints the certification.
  psql(
    `insert into itera.progress (user_id, activity_id, status, completed_at)
     select :'id'::uuid, a.id, 'completed', now() from itera.activities a where a.status = 'published' and a.lesson_id = (
       select l.id from itera.programs p join itera.units u on u.program_id = p.id join itera.lessons l on l.unit_id = u.id
       where p.slug = 'itera-v2' and exists (select 1 from itera.activities x where x.lesson_id = l.id and x.status = 'published') order by u.ordinal, l.ordinal, l.id limit 1)
     on conflict (user_id, activity_id) do update set status = 'completed', completed_at = excluded.completed_at;`,
    { id: learner.userId },
  );
  let answer = await callAs(learner, 'passport', { lang: 'pt' });
  for (let round = 0; round < 4 && answer.remaining > 0; round += 1) answer = await callAs(learner, 'passport', { lang: 'pt' });
  const asset = await until(async () => psql(`select coalesce(asset_address, '') from itera.user_achievements where user_id = :'id'::uuid and achievement_key = 'trail_pass' and mint_status = 'minted';`, { id: learner.userId }), Boolean, 20, 2000);
  check('setup: the learner has a minted certification', Boolean(asset), asset);

  const { page } = instructor;
  await page.goto(`${BASE}/live/instructor`, { waitUntil: 'domcontentloaded' });
  await tid(page, 'instructor-certifications-link').waitFor({ timeout: 40_000 });
  await tid(page, 'instructor-certifications-link').click();
  await tid(page, 'student-certifications').waitFor({ timeout: 40_000 });
  check('instructor area: "Certificações dos alunos" lists the learner\'s certification', (await tid(page, 'student-certification').count()) === 1 && (await tid(page, 'student-certifications-title').innerText()).trim() === 'Certificações dos alunos');
  await snap(page, 'endorse-list');
  await tid(page, 'student-endorse').click();
  await tid(page, 'endorse-dialog').waitFor();
  const dialog = await tid(page, 'endorse-dialog').innerText();
  check('confirm dialog: says it is written on-chain and public', /on-chain/.test(dialog) && /público/.test(dialog) && /não dá pra desfazer/.test(dialog), dialog.replace(/\s+/g, ' ').slice(0, 200));
  await tid(page, 'endorse-note').fill('Explicou a página pra turma inteira.');
  await snap(page, 'endorse-dialog');
  await tid(page, 'endorse-confirm').click();
  await tid(page, 'student-endorsed').waitFor({ timeout: 60_000 });
  check('after the write the row says "Endossada por você"', /Endossada por você/.test(await tid(page, 'student-certification').innerText()) && psql(`select wallet from itera.endorsements e join itera.user_achievements a on a.id = e.user_achievement_id where a.asset_address = :'asset' and e.tx_signature is not null;`, { asset }) === instructor.address);
  await snap(page, 'endorse-done');

  // The public page, in a context with no wallet and no session.
  const visitor = await instructor.context.browser().newContext({ viewport: DESKTOP, locale: 'pt-BR' });
  const publicPage = await visitor.newPage();
  await sleep(21_000);
  await publicPage.goto(`${BASE}/c/${asset}`, { waitUntil: 'domcontentloaded' });
  await publicPage.getByTestId('credential-endorsement').first().waitFor({ timeout: 60_000 });
  const link = publicPage.locator('[data-testid="credential-endorsement"] a').first();
  check('/c/<asset>: "Endossada por" with the instructor wallet linking to /u/<wallet>', /Endossada por/.test(await publicPage.getByTestId('credential-card').innerText()) && (await link.getAttribute('href')) === `/u/${instructor.address}` && (await link.getAttribute('title')) === instructor.address);
  const art = await publicPage.locator('img[src*="credential-meta"]').first().getAttribute('src').catch(() => null);
  const svg = art ? await (await fetch(art)).text() : '';
  check('/c/<asset>: the art carries the seal (versioned URL)', svg.includes('data-endorsed="1"') && /v=e1/.test(art ?? ''), art);
  await sleep(1500);
  await snap(publicPage, 'credential-endorsed', { fullPage: true });
  await visitor.close();
  return asset;
}

async function circuit(learner, authority) {
  await fund(authority, learner.address, 3_200_000n);
  const { page } = learner;
  await page.goto(`${BASE}/shop`, { waitUntil: 'domcontentloaded' });
  await tid(page, 'circuit-strip').waitFor({ timeout: 40_000 });
  const before = await tid(page, 'circuit-strip').innerText();
  check('shop header strip before any purchase: no stamps claimed for this learner', /Cada compra sua paga carimbos de outros alunos/.test(before) && /no total a loja pagou/.test(before) && /taxa de rede/.test(before), before.replace(/\s+/g, ' ').slice(0, 200));
  await tid(page, 'circuit-strip').scrollIntoViewIfNeeded();
  await snap(page, 'circuit-strip-before', { focus: tid(page, 'circuit-strip') });
  const card = shopCard(page, 'outfit_glasses');
  await card.scrollIntoViewIfNeeded();
  await card.getByTestId('shop-buy').click();
  await page.locator('[data-testid="purchase-dialog"][data-phase="paid"]').waitFor({ timeout: 90_000 });
  const line = (await visible(tid(page, 'purchase-circuit'), 3000)) ? await tid(page, 'purchase-circuit').innerText() : '';
  check('success dialog: "+110 carimbos pagos pra outros alunos"', line.trim() === '+110 carimbos pagos pra outros alunos', line || (await tid(page, 'purchase-dialog').innerText()).replace(/\s+/g, ' ').slice(0, 200));
  await snap(page, 'circuit-purchase-dialog');
  await tid(page, 'purchase-done').click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await tid(page, 'circuit-strip').waitFor({ timeout: 40_000 });
  const after = await until(() => tid(page, 'circuit-strip').innerText(), (text) => /já pagaram/.test(text), 10, 2000);
  check('strip after the purchase: "Suas compras já pagaram 110 carimbos de outros alunos · no total a loja pagou N ↗"', /Suas compras já pagaram 110 carimbos de outros alunos/.test(after) && /no total a loja pagou [\d.,]+ ↗/.test(after) && /explorer\.solana\.com\/address\//.test((await tid(page, 'circuit-explorer').getAttribute('href')) ?? ''), after.replace(/\s+/g, ' ').slice(0, 200));
  await tid(page, 'circuit-strip').scrollIntoViewIfNeeded();
  await snap(page, 'circuit-strip-after', { focus: tid(page, 'circuit-strip') });
  await sleep(21_000);
  await page.goto(`${BASE}/u/${learner.address}`, { waitUntil: 'domcontentloaded' });
  const profileLine = (await visible(tid(page, 'profile-circuit'), 40_000)) ? await tid(page, 'profile-circuit').innerText() : '';
  check('/u/<wallet>: the Circuito line', /110 carimbos de outros alunos/.test(profileLine), profileLine);
  await sleep(2000);
  await snap(page, 'profile-circuit', { fullPage: true });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const authority = loadAuthority();
  const startBalance = await balance(authority.address);
  const browser = await chromium.launch({ headless: true });
  const learner = await newPerson(browser, 'learner');
  const instructor = await newPerson(browser, 'instructor');
  try {
    await signIn(learner, 'Lia');
    await signIn(instructor, 'Prof Rui');
    const tenantId = makeTenant('browser', instructor, [learner]);
    const only = option('only', 'laurel,podium,endorse,circuit').split(',');
    if (only.includes('laurel')) await laurel(learner);
    if (only.includes('podium')) await podium(instructor, learner, tenantId);
    if (only.includes('endorse')) await endorsement(instructor, learner);
    if (only.includes('circuit')) await circuit(learner, authority);
  } finally {
    const errors = [...learner.errors, ...instructor.errors];
    if (errors.length > 0) console.log(`page errors: ${errors.join(' | ').slice(0, 600)}`);
    await browser.close();
  }
  const endBalance = await balance(authority.address);
  console.log(`\nauthority: ${sol(startBalance)} -> ${sol(endBalance)} SOL (${sol(endBalance - startBalance)})`);
  const { total, failed } = summary();
  writeFileSync(join(OUT, 'results.json'), JSON.stringify({ total, failed, learner: learner.address, instructor: instructor.address }, null, 2));
  console.log(`${total - failed.length}/${total} checks passed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
