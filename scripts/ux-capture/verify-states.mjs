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
 * ═══════════════════════════════════════════════════════════════════════════
 * 📱 AND IT IS THE GATE AT THE SECOND VIEWPORT TOO
 * ═══════════════════════════════════════════════════════════════════════════
 * `--viewport mobile` replays every candidate in the mobile capture context
 * (390x844, `isMobile`, `hasTouch`; ADR-6 of plan
 * `20260902-ux-paths-responsive-mobile-capture`). That matters because the
 * states a mobile round is looking for are the ones a replay CANNOT find — an
 * open drawer, a bottom sheet, an overflow menu — so they come from a bounded
 * model session and arrive here as claims, exactly like the first five did.
 * A claim that reproduces at 390 is written with `viewport: "mobile"` on it, so
 * the suite replays it only where it exists.
 *
 * ⚠️ The context and the launch flags are no longer restated in this file. They
 * come from `@devfellowship/ux-paths-capture`, which is the same source
 * `e2e/support/captureRegions.ts` and the capture suites read. The literals
 * that used to be here were a second copy of a determinism contract, and this
 * script's whole value is that it replays under the SAME conditions the capture
 * will — a copy that drifts makes the gate weaker while it stays green.
 *
 * Usage:
 *   node scripts/ux-capture/verify-states.mjs \
 *     --candidates <model-output.json> \
 *     --manifest   e2e/support/capture-manifest.json \
 *     [--base http://127.0.0.1:4189] [--viewport desktop|mobile] [--write]
 *
 * Without `--write` it only reports. Exit 0 = every candidate reproduced.
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  CAPTURE_LAUNCH_ARGS,
  DEFAULT_VIEWPORT_PRESET,
  captureContextOptions,
  resolveViewportSpec,
  viewportLabel,
} from '@devfellowship/ux-paths-capture/playwright';

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

/**
 * The viewport to replay at. A candidate may name its own — a state harvested
 * at 390 is verified at 390 even in a mixed candidate file — and `--viewport`
 * is the default for the ones that do not.
 */
const { name: defaultViewport, preset: defaultPreset, custom } = resolveViewportSpec(
  arg('viewport', DEFAULT_VIEWPORT_PRESET)
);
if (custom) {
  console.warn(
    `⚠️  ${viewportLabel(defaultPreset)} matches no preset, so it takes the DEFAULT ` +
      `input modality at a new size — a "narrow desktop" and not a phone. See ADR-6.`
  );
}

const candidates = JSON.parse(readFileSync(CANDIDATES, 'utf8')).states ?? [];
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

// Same browser as the capture, or the check means less.
const browser = await chromium.launch({ args: [...CAPTURE_LAUNCH_ARGS] });
const accepted = [];
const rejected = [];

console.log(
  `replaying ${candidates.length} candidate(s) at ${defaultViewport} ` +
    `(${viewportLabel(defaultPreset)}) against ${BASE}`
);

for (const candidate of candidates) {
  // 🚨 The viewport is resolved PER CANDIDATE and the context is opened with
  // it, so a candidate that claims `viewport: "mobile"` is never blessed by a
  // desktop replay. That is the same class of mistake the fresh context exists
  // to stop: a claim proved under conditions it did not claim.
  const { name: viewportName, preset } = resolveViewportSpec(
    candidate.viewport ?? defaultViewport
  );
  const context = await browser.newContext(captureContextOptions(preset));
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
      // Written ONLY for a non-default viewport. A state that exists
      // everywhere carries no `viewport` key, so the manifest of the five
      // states frozen in 2026-08 is byte-unchanged by this script.
      ...(viewportName === DEFAULT_VIEWPORT_PRESET ? {} : { viewport: viewportName }),
    });
    console.log(`  ✅ ${candidate.id} @${viewportName}`);
  } else {
    rejected.push({
      id: candidate.id,
      url: candidate.url,
      viewport: viewportName,
      reason: verdict.reason,
    });
    console.log(`  ❌ ${candidate.id} @${viewportName} — ${verdict.reason}`);
  }
}

await browser.close();

console.log(`\n${accepted.length} reproduced, ${rejected.length} did not.`);

if (has('write')) {
  /**
   * 🚨 `--write` REPLACES `states`, and a partial candidate file is now the
   * normal case.
   *
   * This script has always written `manifest.states = accepted`, and that was
   * safe while there was exactly one exploration session covering every state.
   * The mobile round breaks that assumption: a candidate file from a bounded
   * 390 session holds only the mobile-only states, so a plain `--write` would
   * DELETE the five states frozen in 2026-08 and the suite would go green with
   * five fewer assertions — the quietest possible regression.
   *
   * So a write that would drop an existing id STOPS, and says which. Passing
   * `--replace-all` is how a caller says the candidate file really is the whole
   * set, which is what the original 2026-08 run was.
   */
  const before = (manifest.states ?? []).map((s) => s.id);
  const after = new Set(accepted.map((s) => s.id));
  const dropped = before.filter((id) => !after.has(id));
  if (dropped.length && !has('replace-all')) {
    console.error(
      `refusing to write: ${dropped.length} state(s) already in ${MANIFEST} are absent ` +
        `from the candidate file and would be DELETED — ${dropped.join(', ')}.\n` +
        `A partial candidate file (one viewport, one session) is normal; deleting the ` +
        `rest of the map is not. Add them to the candidate file, or pass --replace-all ` +
        `if this file really is the whole set.`
    );
    process.exit(2);
  }

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
