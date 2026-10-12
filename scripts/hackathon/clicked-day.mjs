#!/usr/bin/env node
// A robot learner completes ONE whole lesson day on the LIVE site by really clicking, dragging and typing in
// the lesson player, with a brand-new wallet, then proves the certification (UI + API + chain).
//   flock /tmp/hk/orch/locks/browser.lock node scripts/hackathon/clicked-day.mjs \
//     --wallet-file /tmp/hk/orch/graph-clicked-day/wallet.json [--out DIR] [--lang pt|en] [--stop-after N] [--verify-only] [--guest]
//     [--viewport 1440x900] [--end-viewport 390x844] [--home-first] [--chest] [--chest-also 390x844]
// `--chest` follows the chest of the day on the stamp screen (sealed, then the Tera), and looks for it again after a reload;
// `--chest-also` shoots the opened chest at a second window size too.
// `--end-viewport` resizes the window before the last activity, so the stamp screen is seen at that size.
// `--home-first` opens the dashboard before the lesson, as a person who has just signed in does.
// `--guest` plays the landing's first path: the whole day at /try with NO session (answers kept in the browser),
// then the wallet's session appears (the sign-in) and the page claims the answers; the day must be stamped at once.
// `--lang` is the language the robot studies in: the page is set to it and the robot types what the lesson
// asks for in THAT language (the headings of the editor exercises differ between pt and en).
// It READS activity specs with psql (to know the right answer). It never writes progress, attempts or
// achievements, and never calls `grade` or `passport` itself: every answer goes through the UI.
// Environment (source ~/.config/itera-hackathon/supabase.env): HACKATHON_DB_PASSWORD, SUPABASE_ACCESS_TOKEN.
import { createHash, generateKeyPairSync, createPrivateKey, sign } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { resolveSpec } from '../../supabase/functions/_shared/grading.ts';
import { base58Encode } from '../../supabase/functions/_shared/solana-tx.ts';
import { servedIds, servedLesson } from './day-solver.lib.mjs';
import { FUNCTIONS, PROJECT_REF, SUPABASE_URL, anonKey, psql, rpc, sleep } from './social-e2e.lib.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const BASE = option('base', 'https://hackathon-colosseum.178-105-2-230.sslip.io').replace(/\/$/, '');
const OUT = option('out', '/tmp/hk/orch/graph-clicked-day');
const WALLET_FILE = option('wallet-file', `${OUT}/wallet.json`);
const STOP_AFTER = Number(option('stop-after', '0'));
const VERIFY_ONLY = args.includes('--verify-only');
const GUEST = args.includes('--guest');
const HOME_FIRST = args.includes('--home-first');
const CHEST = args.includes('--chest');
const size = (text) => (/^\d+x\d+$/.test(text ?? '') ? { width: Number(text.split('x')[0]), height: Number(text.split('x')[1]) } : null);
const CHEST_ALSO = size(option('chest-also', ''));
const VIEWPORT = size(option('viewport', '')) ?? { width: 1280, height: 900 };
const END_VIEWPORT = size(option('end-viewport', ''));
const GUEST_ANSWERS_KEY = 'itera.guest.day1.v1';
const ACTIVITY_BOX = GUEST ? 'try-activity' : 'lesson-activity';
const LANG = option('lang', 'pt') === 'en' ? 'en' : 'pt';
const LESSON_ID = '0e7d6618-f9ba-46ba-bf28-71cf86f32716';
const SIWS_HOST = 'hackathon.iterahq.dev';
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const NODES = ['html-tags', 'html-skeleton'];

mkdirSync(OUT, { recursive: true });
let shotNumber = existsSync(`${OUT}/.shot-counter`) ? Number(readFileSync(`${OUT}/.shot-counter`, 'utf8')) : 0;
const log = (line) => {
  const text = `${new Date().toISOString()} ${line}`;
  console.log(text);
  appendFileSync(`${OUT}/run.log`, `${text}\n`);
};
const proofs = [];
const proof = (name, pass, detail = '') => {
  proofs.push({ name, pass: Boolean(pass), detail: String(detail).slice(0, 400) });
  log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 300)})` : ''}`);
};
async function shot(page, label) {
  shotNumber += 1;
  writeFileSync(`${OUT}/.shot-counter`, String(shotNumber));
  const path = `${OUT}/${String(shotNumber).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path }).catch(() => {});
  return path;
}

// ── Wallet and session ────────────────────────────────────────────────────────────────────────
async function signIn(apikey, secretSeed) {
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, secretSeed]), format: 'der', type: 'pkcs8' });
  const spki = (await import('node:crypto')).createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  const address = base58Encode(spki.subarray(-32));
  const message = [`${SIWS_HOST} wants you to sign in with your Solana account:`, address, '', 'Sign in to Itera Hackathon', '', `URI: https://${SIWS_HOST}/login`, 'Version: 1', `Issued At: ${new Date().toISOString()}`].join('\n');
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=web3`, { method: 'POST', headers: { apikey, 'Content-Type': 'application/json' }, body: JSON.stringify({ chain: 'solana', message, signature: sign(null, Buffer.from(message), privateKey).toString('base64url') }) });
  const session = await response.json();
  if (!response.ok || !session.access_token) throw new Error(`sign-in failed: HTTP ${response.status}`);
  return { address, session };
}

async function loadWallet(apikey) {
  if (existsSync(WALLET_FILE)) {
    const saved = JSON.parse(readFileSync(WALLET_FILE, 'utf8'));
    // Refresh when the access token is near its end: the browser would otherwise refresh with a stale token.
    if (saved.session.expires_at * 1000 - Date.now() < 10 * 60_000) {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: saved.session.refresh_token }) });
      const session = await response.json();
      if (response.ok && session.access_token) saved.session = session;
      else {
        log(`refresh failed (HTTP ${response.status}), signing in again with the saved key`);
        saved.session = (await signIn(apikey, Buffer.from(saved.seedHex, 'hex'))).session;
      }
      writeFileSync(WALLET_FILE, JSON.stringify(saved, null, 2), { mode: 0o600 });
    }
    log(`resuming wallet ${saved.address}`);
    return saved;
  }
  const { privateKey } = generateKeyPairSync('ed25519');
  const seed = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32);
  const { address, session } = await signIn(apikey, seed);
  const userId = psql(`select user_id from itera.identities where provider_subject = :'subject' limit 1;`, { subject: session.user.id });
  const saved = { address, userId, seedHex: seed.toString('hex'), session };
  writeFileSync(WALLET_FILE, JSON.stringify(saved, null, 2), { mode: 0o600 });
  log(`new wallet ${address} · itera user ${userId}`);
  return saved;
}

// ── Solutions, read from the database ─────────────────────────────────────────────────────────
const readActivities = () =>
  JSON.parse(
    psql(`select json_agg(json_build_object('id', id, 'kind', kind, 'spec', spec) order by ordinal, id) from itera.activities where lesson_id = :'lesson'::uuid and status = 'published';`, { lesson: LESSON_ID }),
  ).map((activity) => ({ ...activity, authored: activity.spec, spec: resolveSpec(activity.spec, LANG), domId: (id) => id }));

/**
 * The page shows each option under an id of its own (the lesson is served without the answer key and
 * with its ids replaced): the robot finds the option it wants by its content, as a person would.
 */
async function learnServedIds(activities, apikey, accessToken) {
  const served = await servedLesson(FUNCTIONS, { apikey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, LESSON_ID);
  const byId = new Map(served.map((activity) => [activity.id, activity]));
  for (const activity of activities) {
    const ids = servedIds({ spec: activity.authored }, byId.get(activity.id));
    activity.domId = (id) => ids.get(id) ?? id;
  }
  return served.filter((activity) => activity.sealed).length;
}

const NAME = 'Robo QA';
/** The text a check of the activity expects, as the lesson words it in the robot's language. */
const expected = (activity, checkId) => activity.spec.checks.find((check) => check.id === checkId)?.assert?.contains;

/** The text a learner would type into a Monaco editor for this activity, following the prompt in `LANG`. */
function codeSolution(activity, ordinal) {
  const starter = activity.spec.starter ?? '';
  if (ordinal === 10) {
    const heading = activity.spec.checks[0].assert.contains;
    return starter.replace(`<h1>${heading}</h1>`, `<h2>${heading}</h2>`);
  }
  if (ordinal === 14) {
    const about = activity.spec.checks[3].assert.contains;
    return starter.replace('<title></title>', `<title>${NAME}</title>`).replace('<h1></h1>', `<h1>${NAME}</h1>`).replace(`<h3>${about}</h3>`, `<h2>${about}</h2>`);
  }
  const sentence = LANG === 'en' ? 'I am learning HTML.' : 'Estou aprendendo HTML.';
  return `<!DOCTYPE html>\n<html>\n<head>\n<title>${NAME}</title>\n</head>\n<body>\n<h1>${NAME}</h1>\n<h2>${expected(activity, 'sobre-mim')}</h2>\n<p>${sentence}</p>\n<h2>${expected(activity, 'frase-metas')}</h2>\n</body>\n</html>\n`;
}

// ── The robot ─────────────────────────────────────────────────────────────────────────────────
const CONTINUE = /^(Continuar|Continue)$/;

async function handle(page, activity, ordinal, ctx) {
  const root = page.getByTestId(ACTIVITY_BOX);
  const spec = activity.spec;
  const footer = page.getByTestId('feedback-footer');
  const footerContinue = page.getByTestId('feedback-footer-continue');
  const settle = async (what) => {
    // The verdict surfaces as the global footer, or (code kinds) as the activity's own checks panel.
    const ownContinue = root.locator('[data-testid="code-checks-continue"], [data-testid="guided-continue"]').first();
    let path = null;
    for (let wait = 0; wait < 120 && !path; wait += 1) {
      if (await footer.isVisible().catch(() => false)) path = 'footer';
      else if (await ownContinue.isVisible().catch(() => false)) path = 'own';
      else if ((await root.getAttribute('data-activity-id').catch(() => activity.id)) !== activity.id) path = 'advanced';
      else await page.waitForTimeout(250);
    }
    if (!path) {
      await shot(page, `no-verdict-${ordinal}-${activity.kind}`);
      throw new Error(`activity ${ordinal} (${activity.kind}): no verdict surface appeared`);
    }
    ctx.done.push(`${what}:${path}`);
    log(`verdict surface for ${ordinal}: ${path}`);
    if (path === 'advanced') return;
    const surface = path === 'footer' ? footer : root.locator('[data-testid="code-checks-feedback"], [data-testid="guided-feedback"]').first();
    if (path === 'footer' && (await footer.getAttribute('data-correct')) !== 'true') {
      await shot(page, `wrong-${ordinal}-${activity.kind}`);
      throw new Error(`activity ${ordinal} (${activity.kind}) was answered wrong: ${await footer.innerText()}`);
    }
    await shot(page, `activity-${ordinal}-${activity.kind}-ok`);
    await (path === 'footer' ? footerContinue : ownContinue).click();
    void surface;
  };

  switch (activity.kind) {
    case 'concept': {
      await page.getByRole('button', { name: CONTINUE }).last().click({ timeout: 15_000 });
      return 'read the card and pressed Continue';
    }
    case 'concept_reveal': {
      await page.getByTestId('concept-reveal-show').click();
      await page.getByTestId('concept-reveal-answer').waitFor({ state: 'visible' });
      await shot(page, `activity-${ordinal}-concept_reveal-revealed`);
      await page.getByRole('button', { name: CONTINUE }).last().click({ timeout: 15_000 });
      return 'clicked "show answer", then Continue';
    }
    case 'xray': {
      const stage = page.getByTestId('xray-stage');
      await stage.scrollIntoViewIfNeeded();
      const box = await stage.boundingBox();
      // A lens sweep: horizontal passes, row by row, with the real mouse.
      await page.mouse.move(box.x + 4, box.y + 4);
      for (let row = 0; row < 9; row += 1) {
        const y = box.y + (box.height * (row + 0.5)) / 9;
        const [from, to] = row % 2 === 0 ? [4, box.width - 4] : [box.width - 4, 4];
        await page.mouse.move(box.x + from, y);
        await page.mouse.move(box.x + to, y, { steps: 18 });
      }
      await settle('xray');
      return 'swept the mouse lens across the page (9 passes), then footer Continue';
    }
    case 'inspect': {
      const pageTargets = root.getByTestId('inspect-page-target');
      const codeTargets = root.getByTestId('inspect-code-target');
      const count = await pageTargets.count();
      for (let index = 0; index < count; index += 1) {
        await pageTargets.nth(index).click();
        await page.waitForTimeout(250);
        await codeTargets.nth(index).click();
        await page.waitForTimeout(250);
      }
      await settle('inspect');
      return `paired ${count} page elements with their code lines, then footer Continue`;
    }
    case 'single_choice': {
      await root.locator(`[data-testid="single-choice-option"][data-option-id="${activity.domId(spec.correct_option_id)}"]`).click();
      await root.getByTestId('single-choice-submit').click();
      await settle('single_choice');
      return `clicked option "${spec.correct_option_id}", pressed Submit, then footer Continue`;
    }
    case 'match': {
      for (const pair of spec.pairs) {
        await root.locator(`[data-testid="match-left-card"][data-option-id="${activity.domId(pair.left_id)}"]`).click();
        await root.locator(`[data-testid="match-right-card"][data-option-id="${activity.domId(pair.right_id)}"]`).click();
      }
      await root.getByTestId('match-submit').click();
      await settle('match');
      return `tapped ${spec.pairs.length} left+right card pairs, Submit, footer Continue`;
    }
    case 'order': {
      const target = (spec.correct_order ?? spec.items.map((item) => item.id)).map(activity.domId);
      const rows = root.getByTestId('order-item');
      const currentIds = async () => rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-option-id')));
      let moves = 0;
      for (let position = 0; position < target.length; position += 1) {
        for (let guard = 0; guard < 20; guard += 1) {
          const order = await currentIds();
          const at = order.indexOf(target[position]);
          if (at <= position) break;
          await rows.nth(at).getByTestId('order-move-up').click();
          moves += 1;
          await page.waitForTimeout(120);
        }
      }
      await root.getByTestId('order-submit').click();
      await settle('order');
      return `moved rows with the up arrows (${moves} clicks), Submit, footer Continue`;
    }
    case 'code_editor_checks': {
      const code = codeSolution(activity, ordinal);
      const monaco = root.locator('.monaco-editor').first();
      const fallback = root.getByTestId('code-editor-fallback');
      await root.getByTestId('code-pane-switch').getByRole('button').first().click({ timeout: 1500 }).catch(() => {});
      const modelValue = () => page.evaluate(() => window.monaco?.editor.getModels().at(-1)?.getValue() ?? null);
      const useMonaco = await monaco.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false);
      // Monaco never came: the player shows a plain text area in its place after a few seconds.
      if (!useMonaco) await fallback.waitFor({ state: 'visible', timeout: 5_000 });
      const focus = () => (useMonaco ? monaco.locator('.view-lines').click() : fallback.click());
      // Strategy 1: paste-like insert of the whole text. Strategy 2: line by line with the Enter key.
      for (const strategy of ['whole', 'lines']) {
        await focus();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Delete');
        if (strategy === 'whole') await page.keyboard.insertText(code);
        else {
          const lines = code.replace(/\n$/, '').split('\n');
          for (let index = 0; index < lines.length; index += 1) {
            await page.keyboard.insertText(lines[index]);
            if (index < lines.length - 1) await page.keyboard.press('Enter');
          }
        }
        await page.waitForTimeout(500);
        const now = await modelValue();
        log(`editor content after "${strategy}" typing: ${now === code || now === code.replace(/\n$/, '') ? 'matches' : `DIFFERS ${JSON.stringify(now)}`}`);
        if (now === null || now === code || now === code.replace(/\n$/, '')) break;
      }
      await page.waitForTimeout(800);
      await shot(page, `activity-${ordinal}-code-typed`);
      await root.getByTestId('code-submit').click();
      await settle('code_editor_checks');
      return `focused the editor, Ctrl+A, typed ${code.length} chars (${code.split('\n').length} lines), Submit, footer Continue`;
    }
    case 'code_fill_type': {
      for (const blank of spec.blanks) {
        const field = root.getByTestId(`guided-blank-${blank.id}`);
        await field.click();
        await field.pressSequentially(blank.answer, { delay: 15 });
      }
      await shot(page, `activity-${ordinal}-blanks-typed`);
      await root.getByTestId('guided-submit').click();
      await settle('code_fill_type');
      return `typed ${spec.blanks.length} blanks, Submit, footer Continue`;
    }
    default:
      throw new Error(`no handler for kind ${activity.kind}`);
  }
}

async function nicknameStep(page) {
  const gate = page.getByTestId('nickname-gate');
  if (await gate.waitFor({ state: 'visible', timeout: 12_000 }).then(() => true, () => false)) {
    await page.getByTestId('nickname-input').fill('Robo QA');
    await page.getByTestId('nickname-submit').click();
    await gate.waitFor({ state: 'hidden', timeout: 15_000 });
    log('nickname gate answered through the UI');
  }
}

async function runLesson(wallet, activities) {
  const table = [];
  const gradeCalls = [];
  const progressWrites = [];
  let currentId = null;
  const browser = await chromium.launch({ headless: true });
  let completed = false;
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, locale: LANG === 'en' ? 'en-US' : 'pt-BR' });
    const sessionKey = `sb-${PROJECT_REF}-auth-token`;
    await context.addInitScript(([key, value, lang]) => {
      // The lesson preview is a sandboxed frame with no storage: only the page itself is prepared.
      try {
        if (value) localStorage.setItem(key, value);
        localStorage.setItem('itera.locale', lang);
      } catch {
        /* sandboxed frame */
      }
    }, [sessionKey, GUEST ? null : JSON.stringify(wallet.session), LANG]);
    const page = await context.newPage();
    page.on('request', (request) => {
      if (request.url().includes('/functions/v1/grade') && request.method() === 'POST') gradeCalls.push({ activity: currentId, status: null, verdict: null, sent: Object.keys(request.postDataJSON() ?? {}), request });
    });
    const passportAnswers = [];
    page.on('response', async (response) => {
      const request = response.request();
      const url = response.url();
      if (url.includes('/functions/v1/passport') && request.method() === 'POST') passportAnswers.push(await response.json().catch(() => null));
      if (url.includes('/functions/v1/grade') && request.method() === 'POST') {
        const call = gradeCalls.find((entry) => entry.request === request);
        if (call) {
          call.status = response.status();
          call.verdict = (await response.json().catch(() => null))?.verdict ?? null;
        }
      }
      if (url.includes('/rest/v1/progress') && request.method() !== 'GET') progressWrites.push(`${request.method()} ${response.status()} ${request.postData()?.slice(0, 80)}`);
    });

    if (HOME_FIRST && !GUEST) {
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('dash-bounties').waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(2500);
      log(`home before the lesson: ${(await page.getByTestId('dash-bounties').innerText().catch(() => '(no bounties card)')).replace(/\s+/g, ' ').slice(0, 200)}`);
    }
    await page.goto(GUEST ? `${BASE}/try` : `${BASE}/lesson/${LESSON_ID}`, { waitUntil: 'domcontentloaded' });
    if (GUEST) proof('visitor: /try opened with no session in the browser', page.url().endsWith('/try') && (await page.evaluate((key) => localStorage.getItem(key), sessionKey)) === null, page.url());
    else proof('lesson opened at /lesson/<id>', page.url().includes(`/lesson/${LESSON_ID}`), page.url());
    if (!GUEST) await nicknameStep(page);
    const activityBox = page.getByTestId(ACTIVITY_BOX);
    const lessonEnd = '[data-testid="ceremony-status"], [data-testid="credential-card"], [data-testid="lesson-end-hold"]';
    const ceremony = page.locator(GUEST ? '[data-testid="try-done"]' : lessonEnd).first();
    let handled = 0;
    let lastId = null;
    for (let guard = 0; guard < 60; guard += 1) {
      await Promise.race([
        activityBox.waitFor({ state: 'visible', timeout: 45_000 }).catch(() => {}),
        ceremony.waitFor({ state: 'visible', timeout: 45_000 }).catch(() => {}),
      ]);
      if (!(await activityBox.isVisible().catch(() => false))) {
        completed = true;
        break;
      }
      const id = await activityBox.getAttribute('data-activity-id');
      if (id === lastId) {
        await page.waitForTimeout(400);
        continue;
      }
      const ordinal = activities.findIndex((entry) => entry.id === id) + 1;
      if (ordinal === 0) throw new Error(`unknown activity on screen: ${id}`);
      const activity = activities[ordinal - 1];
      currentId = id;
      lastId = id;
      await page.waitForTimeout(700);
      if (END_VIEWPORT && ordinal === activities.length) await page.setViewportSize(END_VIEWPORT);
      const ctx = { done: [] };
      const did = await handle(page, activity, ordinal, ctx);
      // The grade request is sent by the player once the answer settles.
      for (let wait = 0; wait < 40 && !gradeCalls.some((call) => call.activity === id && call.status !== null); wait += 1) await page.waitForTimeout(250);
      const calls = gradeCalls.filter((call) => call.activity === id);
      const row = { ordinal, kind: activity.kind, id, did, grade: calls.map((call) => `${call.status}/${call.verdict}`).join(',') || 'none' };
      table.push(row);
      log(`ACTIVITY ${String(ordinal).padStart(2)} ${activity.kind.padEnd(19)} grade=${row.grade.padEnd(10)} ${did}`);
      handled += 1;
      if (STOP_AFTER && ordinal >= STOP_AFTER) {
        log(`stopping after activity ${ordinal} as asked`);
        break;
      }
    }
    if (completed && GUEST) {
      await shot(page, 'visitor-end-card');
      const kept = JSON.parse((await page.evaluate((key) => localStorage.getItem(key), GUEST_ANSWERS_KEY)) ?? '{}');
      const receipts = Object.values(kept).filter((answer) => answer?.receipt?.sig).length;
      proof('visitor: every answer is kept in this browser, the graded ones with the server\'s signed receipt', Object.keys(kept).length === activities.length && receipts >= 8, `${Object.keys(kept).length} answers · ${receipts} receipts`);
      // The sign-in: the wallet's session appears in the browser and the visitor comes back to /try.
      await page.evaluate(([key, value]) => localStorage.setItem(key, value), [sessionKey, JSON.stringify(wallet.session)]);
      const claimStarted = Date.now();
      await page.goto(`${BASE}/try`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(new RegExp(`/lesson/${LESSON_ID}`), { timeout: 45_000 }).catch(() => {});
      const claimMs = Date.now() - claimStarted;
      const claims = gradeCalls.filter((call) => call.sent.includes('claim'));
      proof('after the sign-in the answers are claimed in ONE request and the lesson opens', page.url().includes(`/lesson/${LESSON_ID}`) && claims.length === 1 && claims[0].status === 200, `${claims.length} claim request(s), HTTP ${claims[0]?.status} · /try -> lesson in ${claimMs} ms`);
      proof('the claim takes under 8 s on the page (was 21 s)', claimMs < 8_000, `${claimMs} ms`);
      await nicknameStep(page);
      await page.locator(lessonEnd).first().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {});
      for (let wait = 0; wait < 40 && passportAnswers.length === 0; wait += 1) await page.waitForTimeout(500);
      const held = passportAnswers.find((answer) => answer?.day_pending_review);
      proof('the day is NOT held for review after the claim', passportAnswers.length > 0 && !held, held ? JSON.stringify(held.day_pending_review) : `${passportAnswers.length} passport answer(s), none held`);
    }
    if (completed) {
      // The stamp screen at the moment its loop panel appears, and five seconds later.
      const panel = page.getByTestId('loop-panel');
      const seen = await panel.waitFor({ state: 'visible', timeout: 60_000 }).then(() => true, () => false);
      const panelNow = async (label) => {
        const state = await panel.getAttribute('data-state').catch(() => null);
        const words = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ');
        shotNumber += 1;
        writeFileSync(`${OUT}/.shot-counter`, String(shotNumber));
        const path = `${OUT}/${String(shotNumber).padStart(2, '0')}-stamp-screen-${label}.png`;
        await panel.scrollIntoViewIfNeeded().catch(() => {});
        await page.screenshot({ path }).catch(() => {});
        log(`stamp screen ${label}: state=${state} · ${words.slice(0, 500)} · ${path}`);
        return { state, words };
      };
      if (seen) {
        const states = [];
        const first = await panelNow('t0');
        states.push(first);
        for (let wait = 0; wait < 50; wait += 1) {
          await page.waitForTimeout(100);
          const state = await panel.getAttribute('data-state').catch(() => null);
          const words = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ');
          if (state !== states[states.length - 1].state) states.push({ state, words });
          if (/\b0 (of|de) \d+ /.test(words)) states.push({ state: 'ZERO', words });
        }
        const later = await panelNow('t5');
        const stamped = /stamped|carimbad/i.test((await page.getByTestId('lesson-main').innerText().catch(() => '')));
        proof('stamp screen: the panel never showed a zero count in its first 5 s', !states.some((entry) => entry.state === 'ZERO') && !/\b0 (of|de) \d+ /.test(first.words), states.map((entry) => entry.state).join(' -> '));
        proof('stamp screen: 5 s later the day claims are verified and the paid bounty button is there', stamped && later.state === 'ready' && (await panel.locator('[data-testid="loop-claim"][data-status="verified"]').count()) === NODES.length && (await panel.getByTestId('loop-instant').count()) === 1, `${later.state} · verified claims ${await panel.locator('[data-testid="loop-claim"][data-status="verified"]').count()} · instant ${await panel.getByTestId('loop-instant').count()}`);
      } else log('NOTE: no loop panel at the end of the day');
      await page.waitForTimeout(500);
      await shot(page, 'end-of-day-ceremony');
      if (CHEST) {
        // The chest of the day: one row under the chain row, sealed, then the Tera. It must never push the way out of view.
        const chest = page.getByTestId('day-chest');
        const phases = [];
        const started = Date.now();
        // The robot scrolled down to the panel under the ceremony: back to what a learner sees first.
        const toTop = () => page.getByTestId('stamp-ceremony').evaluate((el) => el.scrollTo(0, 0)).catch(() => {});
        await toTop();
        while (Date.now() - started < 60_000) {
          const phase = await chest.getAttribute('data-phase').catch(() => null);
          if (phase && phase !== phases[phases.length - 1]) {
            phases.push(phase);
            await page.waitForTimeout(phase === 'revealed' ? 900 : 150);
            await shot(page, `chest-${phase}`);
            log(`chest ${phase} at +${Math.round((Date.now() - started) / 100) / 10}s: ${(await chest.innerText().catch(() => '')).replace(/\s+/g, ' ')}`);
          }
          if (phase === 'revealed') break;
          await page.waitForTimeout(250);
        }
        proof('chest: the row appeared under the stamp and ended on the Tera', phases[phases.length - 1] === 'revealed', phases.join(' -> ') || 'no chest row');
        if (CHEST_ALSO) {
          const before = page.viewportSize();
          await page.setViewportSize(CHEST_ALSO);
          await toTop();
          await page.waitForTimeout(600);
          await shot(page, `chest-revealed-${CHEST_ALSO.width}x${CHEST_ALSO.height}`);
          if (before) await page.setViewportSize(before);
          await toTop();
          await page.waitForTimeout(300);
        }
        const box = await chest.boundingBox().catch(() => null);
        const next = await page.locator('[data-testid="lesson-next-cta"], [data-testid="lesson-finish-cta"]').first().boundingBox().catch(() => null);
        const view = page.viewportSize();
        proof('chest: the next-lesson button is still inside the screen, below the chest', Boolean(box && next && view && box.y >= 0 && next.y >= box.y + box.height && next.y + next.height <= view.height), `chest ${box ? Math.round(box.y) : '?'}-${box ? Math.round(box.y + box.height) : '?'} · button ${next ? Math.round(next.y) : '?'}-${next ? Math.round(next.y + next.height) : '?'} · screen ${view?.height}`);
        const inner = await chest.evaluate((el) => [el.scrollHeight, el.clientHeight, el.scrollWidth, el.clientWidth]).catch(() => null);
        proof('chest: nothing scrolls inside the row', Boolean(inner && inner[0] <= inner[1] && inner[2] <= inner[3]), String(inner));
        const verify = await page.getByTestId('day-chest-verify').getAttribute('href').catch(() => null);
        proof('chest: the row links to the page where anyone rolls it again', /^\/verify\?chest=.+#chest$/.test(verify ?? ''), verify ?? '');
        await page.reload({ waitUntil: 'domcontentloaded' });
        const again = await chest.waitFor({ state: 'visible', timeout: 30_000 }).then(() => chest.getAttribute('data-phase'), () => null);
        await page.waitForTimeout(800);
        await shot(page, 'chest-after-reload');
        proof('chest: after a reload the chest of the day is found again, settled', again === 'revealed', String(again));
      }
      const text = (await page.getByTestId('lesson-main').innerText().catch(() => '')).replace(/\s+/g, ' ');
      log(`end of day screen: ${text.slice(0, 300)}`);
    }
    log(`direct writes to /rest/v1/progress: ${progressWrites.length}${progressWrites.length ? ` ${progressWrites.join(' | ')}` : ''}`);
    log(`handled this run: ${handled}; grade calls this run: ${gradeCalls.length} (${gradeCalls.map((c) => `${c.status}`).join(',')})`);
  } catch (error) {
    log(`ROBOT STOPPED: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }
  return { completed, table, progressWrites, gradeCount: gradeCalls.length };
}

// ── Proofs after the day ──────────────────────────────────────────────────────────────────────
async function waitMinted(userId) {
  let last = '';
  for (let attempt = 0; attempt < 12; attempt += 1) {
    last = psql(`select coalesce(mint_status,'') || '|' || coalesce(asset_address,'') || '|' || coalesce(tx_signature,'') from itera.user_achievements where user_id = :'user'::uuid and achievement_key = 'trail_pass' order by earned_at desc limit 1;`, { user: userId });
    log(`poll ${attempt + 1}/12 trail_pass: ${last || '(no row yet)'}`);
    if (last.startsWith('minted|')) break;
    await sleep(5000);
  }
  const [status, asset, tx] = last.split('|');
  return { status, asset, tx };
}

async function publicGraphProof(wallet, mint) {
  const browser = await chromium.launch({ headless: true });
  const result = {};
  try {
    for (const [label, viewport] of [['1440x900', { width: 1440, height: 900 }], ['390x844', { width: 390, height: 844 }]]) {
      const context = await browser.newContext({ viewport, locale: 'en-US' });
      const page = await context.newPage();
      await page.goto(`${BASE}/u/${wallet.address}`, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-testid="capability-graph"]').waitFor({ state: 'visible', timeout: 60_000 });
      // The chain read lights the nodes: wait until the two are proven.
      const states = {};
      for (const id of NODES) {
        const node = page.locator(`[data-node-id="${id}"]`);
        await node.waitFor({ state: 'visible', timeout: 30_000 });
        await page.waitForFunction((nodeId) => ['chain', 'server'].includes(document.querySelector(`[data-node-id="${nodeId}"]`)?.getAttribute('data-view') ?? ''), id, { timeout: 60_000 }).catch(() => {});
        states[id] = await node.getAttribute('data-view');
      }
      await page.locator('[data-node-id="html-tags"]').scrollIntoViewIfNeeded();
      await page.locator('[data-node-id="html-tags"]').click();
      const detail = page.getByTestId('graph-detail');
      await detail.waitFor({ state: 'visible', timeout: 20_000 });
      await page.getByTestId('graph-detail-status').waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
      log(`panel text (${label}): ${(await detail.innerText().catch(() => 'DETAIL GONE')).replace(/\s+/g, ' ').slice(0, 400)}`);
      await shot(page, `panel-open-${label}`);
      const hashOk = await page.getByTestId('graph-hash-ok').waitFor({ state: 'visible', timeout: 30_000 }).then(() => true, () => false);
      const status = await page.getByTestId('graph-detail-status').innerText().catch(() => '');
      const graded = page.getByTestId('graph-evidence-graded');
      const gradedPresent = await graded.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true, () => false);
      const version = gradedPresent ? await graded.getAttribute('data-version') : null;
      const gradedText = gradedPresent ? await graded.innerText() : '';
      result[label] = { states, status, hashOk, gradedPresent, version, gradedText };
      log(`panel still open after the evidence wait (${label}): ${await detail.isVisible().catch(() => false)}`);
      const path = await shot(page, `public-profile-${label}`);
      log(`public profile ${label}: nodes ${JSON.stringify(states)} · status "${status}" · hash-ok ${hashOk} · graded present ${gradedPresent} v${version} "${gradedText}" · ${path}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const first = result['1440x900'];
  proof('public profile (new context, no session): graph visible, html-tags + html-skeleton lit', first && NODES.every((id) => ['chain', 'server'].includes(first.states[id])), JSON.stringify(first?.states));
  proof('node panel says "Verified on chain" and the hash matches in the browser', first && /verified on chain|verificada na blockchain|verificado on-chain/i.test(first.status) && first.hashOk, `${first?.status} · hash-ok ${first?.hashOk}`);
  if (first?.gradedPresent) proof('graph-evidence-graded has data-version=2', first.version === '2', `${first.version} · ${first.gradedText}`);
  else log('NOTE: the deployed site has no [data-testid="graph-evidence-graded"] for this node (checked via API below instead)');
  return result;
}

async function apiProof(wallet, mint) {
  const profile = await (await fetch(`${FUNCTIONS}/learner-profile/${wallet.address}?lang=en`)).json();
  const nodes = profile.capabilities?.nodes ?? [];
  const byId = Object.fromEntries((Array.isArray(nodes) ? nodes : Object.values(nodes)).map((node) => [node.id, node]));
  proof('API learner-profile: html-tags and html-skeleton are verified', NODES.every((id) => byId[id]?.status === 'verified'), NODES.map((id) => `${id}=${byId[id]?.status}`).join(' '));

  const evidenceResponse = await fetch(`${FUNCTIONS}/learner-profile/${wallet.address}/evidence/html-tags`);
  const body = await evidenceResponse.json();
  log(`evidence response keys: ${Object.keys(body).join(',')}`);
  const raw = typeof body.evidence === 'string' ? body.evidence : JSON.stringify(body.evidence);
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* reported below */
  }
  const sha = createHash('sha256').update(raw).digest('hex');
  const evidenceHash = body.evidence_hash ?? parsed?.evidence_hash;
  const share = JSON.stringify(parsed ?? {}).match(/"(\d+\/\d+)"/)?.[1] ?? (parsed?.verified !== undefined ? String(parsed.verified) : null);
  proof('API evidence v2: parses, v===2, verified share, SHA-256(evidence) === evidence_hash', parsed?.v === 2 && Boolean(share) && sha === evidenceHash, `v=${parsed?.v} share=${share} sha=${sha.slice(0, 16)}… hash=${String(evidenceHash).slice(0, 16)}…`);

  const info = await rpc('getAccountInfo', [mint.asset, { encoding: 'base64', commitment: 'confirmed' }]);
  const data = Buffer.from(info.value?.data?.[0] ?? '', 'base64');
  const marker = Buffer.from('claim:html-tags');
  const at = data.indexOf(marker);
  let onChain = false;
  let followed = '';
  if (at >= 0) {
    // Attribute then value: the value is a prefix of the evidence hash. Scan hex-looking runs after the key.
    const tail = data.subarray(at + marker.length, at + marker.length + 160).toString('latin1');
    followed = tail.match(/[0-9a-f]{8,64}/)?.[0] ?? '';
    onChain = followed.length >= 8 && String(evidenceHash).startsWith(followed);
  }
  proof('devnet getAccountInfo(asset) holds "claim:html-tags" followed by a prefix of the evidence hash', onChain, `asset ${mint.asset} · bytes ${data.length} · marker at ${at} · value "${followed}"`);
  return { profileNodes: NODES.map((id) => byId[id]), evidence: parsed, sha, evidenceHash, onchainValue: followed };
}

async function main() {
  const apikey = await anonKey();
  const wallet = await loadWallet(apikey);
  const activities = readActivities();
  log(`the lesson function served ${await learnServedIds(activities, apikey, wallet.session.access_token)} activities sealed (no answer key in the page)`);
  psql(`insert into itera.test_accounts (user_id, reason) values (:'u'::uuid, 'clicked-day') on conflict do nothing;`, { u: wallet.userId });
  log(`lesson ${LESSON_ID}: ${activities.length} published activities: ${activities.map((a) => a.kind).join(', ')}`);
  proof('fresh wallet signed in (Supabase web3 auth)', Boolean(wallet.session?.access_token), `${wallet.address} user ${wallet.userId}`);

  let run = { completed: true, table: [], progressWrites: [], gradeCount: 0 };
  if (!VERIFY_ONLY) run = await runLesson(wallet, activities);
  if (!run.completed) {
    log('day not finished yet (resume with the same --wallet-file)');
    process.exit(2);
  }
  proof('no direct write to /rest/v1/progress from the page', run.progressWrites.length === 0, run.progressWrites.join(' | '));

  const completedRows = psql(`select count(*) from itera.progress where user_id = :'user'::uuid and status = 'completed' and activity_id in (select id from itera.activities where lesson_id = :'lesson'::uuid and status = 'published');`, { user: wallet.userId, lesson: LESSON_ID });
  const passing = psql(`select count(distinct activity_id) from itera.graded_attempts where user_id = :'user'::uuid and passed;`, { user: wallet.userId });
  proof('18 activities completed, each with a passing graded attempt (server rows)', Number(completedRows) === activities.length && Number(passing) === activities.length, `progress completed ${completedRows}/${activities.length} · activities with a passing attempt ${passing}`);

  const attemptRows = psql(`select a.ordinal || '|' || a.kind || '|' || count(g.id) || '|' || count(g.id) filter (where g.passed) || '|' || coalesce(min(g.mode), '') from itera.activities a left join itera.graded_attempts g on g.activity_id = a.id and g.user_id = :'user'::uuid where a.lesson_id = :'lesson'::uuid and a.status = 'published' group by a.id, a.ordinal, a.kind order by a.ordinal, a.id;`, { user: wallet.userId, lesson: LESSON_ID });
  log('server-side graded attempts per activity (ordinal|kind|attempts|passed|mode):');
  for (const row of attemptRows.split('\n')) log(`  ${row}`);
  run.attempts = attemptRows.split('\n');
  const mint = await waitMinted(wallet.userId);
  proof('trail_pass minted (user_achievements.mint_status = minted)', mint.status === 'minted', `${mint.status} asset ${mint.asset} tx ${mint.tx}`);
  let graph = null;
  let api = null;
  if (mint.status === 'minted') {
    // A new account starts with a private profile. The proofs below read the profile as a stranger, so the robot makes
    // the choice a learner makes with the switch: public.
    const choice = await fetch(`${FUNCTIONS}/privacy`, { method: 'POST', headers: { apikey, Authorization: `Bearer ${wallet.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_profile', public: true }) });
    const chosen = await choice.json().catch(() => ({}));
    proof('the learner switched the public profile on (new accounts start private)', choice.ok && chosen.public_profile === true, `HTTP ${choice.status} · ${chosen.public_profile_source ?? ''}`);
    graph = await publicGraphProof(wallet, mint);
    api = await apiProof(wallet, mint);
  }
  const failed = proofs.filter((entry) => !entry.pass);
  writeFileSync(`${OUT}/result.json`, JSON.stringify({ wallet: wallet.address, userId: wallet.userId, asset: mint.asset, tx: mint.tx, activities: run.table, attempts: run.attempts, proofs, graph, api, failed: failed.map((f) => f.name) }, null, 2));
  log(`${proofs.length - failed.length}/${proofs.length} proofs passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  log(`clicked-day failed: ${error.stack ?? error}`);
  process.exit(1);
});
