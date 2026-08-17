/**
 * BYOC ("Bring Your Own Context") LIVE end-to-end — proves the 2-step live path
 * runs the REAL responder + judge and that the CLIENT comparison logic
 * (learner-rating × judge-verdict → PASS/FAIL) is wired correctly.
 *
 * ADDITIVE: a NEW spec file. It does NOT touch Samuel's
 * `sandbox-scenario-live.spec.ts` (which exercises the deterministic/canned path
 * through `/author/activities/:id/test`). This spec drives the OPT-IN live route
 * `/author/activities/:id/test-live` — the `LiveActivityTestHarness` forces the
 * live path (real `/v1/embed/respond` + `/v1/embed/judge`) while writing NOTHING
 * to itera.progress on the player side (in-memory verdict only).
 *
 * WHAT IT ASSERTS (per Tainan — assert the COMPARISON LOGIC, not the model's exact
 * label): after each rating it reads the stable `data-*` on `[data-testid=
 * "byoc-outcome"]` and asserts `data-outcome === (rating === judge-verdict ?
 * 'pass' : 'fail')`. It then deterministically drives the flow to a PASS
 * (retrying with the opposite rating if the first guess disagreed with the fixed
 * judge verdict), clicks Continuar, and asserts the in-memory verdict is Correct.
 *
 * Gated through `e2e/support/gate.ts`. `ITERA_BYOC_ACTIVITY_ID` is **optional**
 * (`e2e.yml` does not declare it), so its absence still skips — but loudly, via
 * the skip census. The credentials are the required `ITERA_SMOKE_*`.
 *
 * ⚠️ `ITERA_PLAYER_URL` used to default to `http://127.0.0.1:8081` — a developer's
 * local `vite preview`, never reachable on the cron runner. That default alone
 * guaranteed this spec could never run in CI. It now falls back to
 * `ITERA_BASE_URL`.
 *
 * Prereqs (env):
 *   - ITERA_PLAYER_URL (defaults to ITERA_BASE_URL) reachable
 *   - ITERA_AUTHOR_EMAIL + ITERA_AUTHOR_PASSWORD — an Itera author/tenant_admin
 *     that can reach /author/* (CLAUDE_SMOKE_* also accepted)
 *   - ITERA_BYOC_ACTIVITY_ID — the uuid of the 7th (BYOC, openness:'byoc')
 *     chat_sandbox activity (created via the author path — see the PR body).
 *   - The player must be built with VITE_ITERA_API_BASE set (so the live path
 *     is active); otherwise the harness falls back to the deterministic renderer
 *     and this spec skips.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import { ITERA_PLAYER_URL } from './support/capabilities';
import { requireCapabilities, skipBlocked } from './support/gate';

const PLAYER_URL = ITERA_PLAYER_URL;
const EMAIL =
  process.env.ITERA_AUTHOR_EMAIL || process.env.ITERA_SMOKE_USERNAME || process.env.CLAUDE_SMOKE_USERNAME || '';
const PASSWORD =
  process.env.ITERA_AUTHOR_PASSWORD || process.env.ITERA_SMOKE_PASSWORD || process.env.CLAUDE_SMOKE_PASSWORD || '';
const ACTIVITY_ID = process.env.ITERA_BYOC_ACTIVITY_ID || '';

// EXTREME inputs so even the free model reliably yields good/bad (the test still
// asserts the comparison logic, not the label — but extremes keep it stable).
const RICH_CONTEXT =
  'Sou professor de biologia do 9º ano. Escreva um parágrafo de abertura (4-5 frases, ' +
  'linguagem simples, um exemplo do cotidiano) explicando o que é fotossíntese para alunos de 14 anos.';
const GARBAGE_CONTEXT = 'aaaa';

async function login(page: Page): Promise<void> {
  await page.goto(`${PLAYER_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="email-input"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('[data-testid="email-input"]').fill(EMAIL);
  await page.locator('[data-testid="password-input"]').fill(PASSWORD);
  await page.locator('[data-testid="submit-login"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
}

/** Read the settled outcome cell and assert the comparison invariant. */
async function readOutcome(outcome: Locator, rating: 'good' | 'bad') {
  await expect(outcome).toBeVisible({ timeout: 30_000 });
  const oc = await outcome.getAttribute('data-outcome');
  const verdict = await outcome.getAttribute('data-judge-verdict');
  const learner = await outcome.getAttribute('data-learner-rating');
  expect(learner).toBe(rating);
  // The comparison logic — this is the load-bearing assertion (independent of
  // whatever label the LLM produced). `unverified` only when the judge degraded.
  if (verdict === 'good' || verdict === 'bad') {
    expect(oc).toBe(rating === verdict ? 'pass' : 'fail');
  } else {
    expect(oc).toBe('unverified');
  }
  return { oc, verdict };
}

test.describe('BYOC live — real responder + judge, client comparison logic', () => {
  test.beforeAll(async () => {
    await requireCapabilities('itera-player', 'itera-smoke', 'byoc-activity');
  });

  test('compose → real response → rate → judge → PASS → Continuar → Correct', async ({ page }) => {
    await login(page);

    await page.goto(`${PLAYER_URL}/author/activities/${ACTIVITY_ID}/test-live`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="live-activity-test-harness"]').waitFor({ state: 'visible', timeout: 20_000 });

    // If the live path isn't active (API unconfigured → deterministic fallback),
    // the BYOC surface won't render — skip rather than fail.
    const live = page.locator('[data-testid="byoc-live"]');
    if (!(await live.isVisible().catch(() => false))) {
      skipBlocked('the live path is not active on this deploy (byoc-live surface absent) — UNVERIFIED, not passing');
    }

    // Step 1: bring a RICH context and send → the REAL responder answers.
    await page.locator('[data-testid="byoc-input"]').fill(RICH_CONTEXT);
    await page.locator('[data-testid="byoc-send"]').click();

    // Step 2: the eval buttons appear after the response finishes streaming.
    await page.locator('[data-testid="byoc-eval"]').waitFor({ state: 'visible', timeout: 40_000 });

    const outcome = page.locator('[data-testid="byoc-outcome"]');

    // First rating: a guess (good). Assert the comparison invariant.
    await page.locator('[data-testid="byoc-rate-good"]').click();
    let { oc } = await readOutcome(outcome, 'good');

    // Deterministically drive to a PASS: if the judge disagreed (fail), the
    // verdict is fixed for this response — retry with the OPPOSITE rating, which
    // must now agree → pass. (unverified => judge degraded; Continue anyway.)
    if (oc === 'fail') {
      await page.locator('[data-testid="byoc-retry"]').click();
      await page.locator('[data-testid="byoc-rate-bad"]').click();
      ({ oc } = await readOutcome(outcome, 'bad'));
      expect(['pass', 'unverified']).toContain(oc);
    }

    // Win → Continuar → in-memory "Correct" verdict.
    await page.locator('[data-testid="byoc-continue"]').click();
    const verdict = page.locator('[data-testid="test-verdict"]');
    await expect(verdict).toBeVisible({ timeout: 10_000 });
    await expect(verdict).toHaveAttribute('data-correct', 'true');

    await page.screenshot({ path: 'e2e-byoc-live-proof.png', fullPage: true });
  });

  test('garbage context → rate → fail-path assertion (comparison logic)', async ({ page }) => {
    await login(page);
    await page.goto(`${PLAYER_URL}/author/activities/${ACTIVITY_ID}/test-live`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="live-activity-test-harness"]').waitFor({ state: 'visible', timeout: 20_000 });

    const live = page.locator('[data-testid="byoc-live"]');
    if (!(await live.isVisible().catch(() => false))) {
      skipBlocked('the live path is not active on this deploy — UNVERIFIED, not passing');
    }

    await page.locator('[data-testid="byoc-input"]').fill(GARBAGE_CONTEXT);
    await page.locator('[data-testid="byoc-send"]').click();
    await page.locator('[data-testid="byoc-eval"]').waitFor({ state: 'visible', timeout: 40_000 });

    // Rate it "good". Whatever the judge decided, the outcome MUST equal the
    // comparison of (rating × verdict) — that invariant is the assertion.
    const outcome = page.locator('[data-testid="byoc-outcome"]');
    await page.locator('[data-testid="byoc-rate-good"]').click();
    await readOutcome(outcome, 'good');
  });
});
