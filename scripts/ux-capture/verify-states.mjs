/**
 * THE GATE BETWEEN A MODEL AND A COMMITTED FILE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 * ═══════════════════════════════════════════════════════════════════════════
 * `scripts/ux-capture/prepass.mjs` answers, with no model at all, which routes
 * render and which bounce. What it CANNOT answer is which UNDECLARED STATES a
 * screen has — a validation error, the second step of a form, the same screen
 * in the other language. Finding those needs judgement over a live browser, so
 * a model does it, once (see `.claude/skills/ux-capture-explore` in
 * `dfl-harness` for the bounded procedure).
 *
 * A model's report is a CLAIM, not data. This script is what converts one into
 * the other: it replays every claimed state from a FRESH browser context and
 * keeps only the ones that reproduce. What survives is written into
 * `e2e/support/capture-manifest.json` and never needs a model again.
 *
 * ⚠️ The fresh context is the whole point, and it is not a formality. The
 * exploration session ran one long-lived browser, so state leaked between the
 * model's own steps — it toggled the language on one screen and then reported
 * an ENGLISH proof string for a later screen it never toggled. Replayed from a
 * clean context in the default locale, that claim is false. Two of the six
 * candidates failed exactly that way on the first pass. A verifier that reused
 * the exploration's browser would have blessed both.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT A PASS MEANS
 * ═══════════════════════════════════════════════════════════════════════════
 * The steps run, the proof locator becomes visible inside the timeout, and the
 * screen is NOT the login page — a state whose steps silently bounced to
 * `/login` would otherwise "pass" on any proof string the login page happens to
 * contain.
 *
 * Usage:
 *   node scripts/ux-capture/verify-states.mjs \
 *     --candidates <model-output.json> \
 *     --manifest   e2e/support/capture-manifest.json \
 *     [--base http://127.0.0.1:4189] [--write]
 *
 * Without `--write` it only reports. Exit 0 = every candidate reproduced.
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

const BASE = arg('base', process.env.STAMP_BASE_URL || 'http://127.0.0.1:4189');
const CANDIDATES = arg('candidates');
const MANIFEST = arg('manifest', 'e2e/support/capture-manifest.json');
if (!CANDIDATES) {
  console.error('--candidates <file.json> is required');
  process.exit(2);
}

const LOGIN_MARKER = '[data-testid="login-page"]';

/** The launch flags the capture uses. Same browser, or the check means less. */
const LAUNCH_ARGS = [
  '--disable-gpu',
  '--disable-partial-raster',
  '--disable-skia-runtime-opts',
  '--force-color-profile=srgb',
  '--disable-lcd-text',
  '--disable-font-subpixel-positioning',
  '--font-render-hinting=none',
];

const CONTEXT = {
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
  reducedMotion: 'reduce',
  timezoneId: 'UTC',
  locale: 'pt-BR',
};

const candidates = JSON.parse(readFileSync(CANDIDATES, 'utf8')).states ?? [];
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

const browser = await chromium.launch({ args: LAUNCH_ARGS });
const accepted = [];
const rejected = [];

for (const candidate of candidates) {
  const context = await browser.newContext(CONTEXT);
  const page = await context.newPage();
  let verdict = { id: candidate.id, ok: false, reason: '' };
  try {
    await page.goto(BASE + candidate.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    for (const step of candidate.steps) {
      const locator = page.locator(step.selector).first();
      await locator.waitFor({ state: 'visible', timeout: 8000 });
      if (step.action === 'fill') await locator.fill(step.value ?? '');
      else if (step.action === 'click') await locator.click();
      else if (step.action === 'press') await locator.press(step.value ?? 'Enter');
      else throw new Error(`unknown action: ${step.action}`);
    }
    await page.locator(candidate.proof_selector).first().waitFor({ state: 'visible', timeout: 12000 });

    // The anti-impersonation check. A step that bounced to /login must not be
    // allowed to pass on a proof string the login page also contains.
    const bounced =
      candidate.url !== '/login' && (await page.locator(LOGIN_MARKER).count()) > 0;
    if (bounced) throw new Error('the steps landed on the login page');

    verdict = { id: candidate.id, ok: true, reason: '' };
  } catch (err) {
    verdict.reason = String(err.message ?? err).split('\n')[0].slice(0, 220);
  }
  await context.close();

  if (verdict.ok) {
    accepted.push({
      id: candidate.id,
      base_screen: candidate.screen,
      url: candidate.url,
      label: candidate.title_pt ?? candidate.id,
      steps: candidate.steps,
      proof: candidate.proof_selector,
      why: candidate.why_it_matters ?? '',
    });
    console.log(`  ✅ ${candidate.id}`);
  } else {
    rejected.push({ id: candidate.id, url: candidate.url, reason: verdict.reason });
    console.log(`  ❌ ${candidate.id} — ${verdict.reason}`);
  }
}

await browser.close();

console.log(`\n${accepted.length} reproduced, ${rejected.length} did not.`);

if (has('write')) {
  manifest.states = accepted;
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`wrote ${accepted.length} state(s) into ${MANIFEST}`);
  writeFileSync(
    '/tmp/ux-capture-rejected.json',
    `${JSON.stringify(rejected, null, 2)}\n`,
    'utf8'
  );
}

process.exit(rejected.length === 0 ? 0 : 1);
