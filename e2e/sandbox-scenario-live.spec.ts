/**
 * sandbox_scenario end-to-end — proves the migrated "Contexto muda tudo" activity
 * renders from the REAL Itera DB through the REAL player and plays the full
 * compose → evaluate loop.
 *
 * The activity `spec` is a `Scenario` run entirely client-side by the shared
 * `@iterahq/activity-spec/runtime`. This spec drives the author "run as student"
 * TEST harness (`/author/activities/:id/test`) — the ONE single-role path that
 * reaches the real DB-backed renderer without needing the instructor live-class
 * role. The harness mounts the SAME ActivityRenderer a learner sees but writes
 * NOTHING to itera.progress (in-memory verdict only), so this is safe to run
 * against prod data.
 *
 * Scenario c1 ("O pedido vago", id d0cb46a8-…): compose the vague ask → rate it
 * WRONG (top) → get the critique + retry → rate it RIGHT (ruim) → add the
 * "redação de escola" context → rate the strong answer RIGHT (top) → win →
 * Continuar → verdict "Correct".
 *
 * CAPABILITY-GATED (like the sibling specs): probes its substrate up front and
 * test.skip()s (NOT fails) when a prerequisite is missing.
 *
 * Prereqs (env):
 *   - ITERA_PLAYER_URL (default http://127.0.0.1:8081) reachable
 *   - ITERA_AUTHOR_EMAIL + ITERA_AUTHOR_PASSWORD — an Itera author/tenant_admin
 *     that can reach /author/* (CLAUDE_SMOKE_* also accepted)
 *   - ITERA_SANDBOX_ACTIVITY_ID (default d0cb46a8-2263-446c-b5b5-f0e053bcf4cd)
 */
import { test, expect, type Page } from '@playwright/test';

const PLAYER_URL = process.env.ITERA_PLAYER_URL || 'http://127.0.0.1:8081';
const EMAIL = process.env.ITERA_AUTHOR_EMAIL || process.env.CLAUDE_SMOKE_USERNAME || '';
const PASSWORD = process.env.ITERA_AUTHOR_PASSWORD || process.env.CLAUDE_SMOKE_PASSWORD || '';
const ACTIVITY_ID = process.env.ITERA_SANDBOX_ACTIVITY_ID || 'd0cb46a8-2263-446c-b5b5-f0e053bcf4cd';

async function playerReachable(): Promise<boolean> {
  try {
    const res = await fetch(PLAYER_URL);
    return res.ok;
  } catch {
    return false;
  }
}

async function login(page: Page): Promise<void> {
  await page.goto(`${PLAYER_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="email-input"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('[data-testid="email-input"]').fill(EMAIL);
  await page.locator('[data-testid="password-input"]').fill(PASSWORD);
  await page.locator('[data-testid="submit-login"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
}

/** Rate the current evaluate step; assert a wrong pick is rejected before the right one. */
async function evaluate(page: Page, correct: 'ruim' | 'meia-boca' | 'top', wrong: 'ruim' | 'meia-boca' | 'top') {
  await page.locator('[data-testid="sandbox-eval"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator(`[data-testid="sandbox-rate-${wrong}"]`).click();
  await expect(page.locator('[data-testid="sandbox-eval-wrong"]')).toBeVisible({ timeout: 10_000 });
  await page.locator('[data-testid="sandbox-eval-retry"]').click();
  await page.locator(`[data-testid="sandbox-rate-${correct}"]`).click();
}

test.describe('migrated sandbox_scenario renders from the DB and plays the evaluate loop', () => {
  test.beforeAll(async () => {
    const ok = (await playerReachable()) && Boolean(EMAIL && PASSWORD);
    test.skip(!ok, 'itera player not reachable or author creds absent — capability-gated skip');
  });

  test('c1 "O pedido vago": compose → mis-rate → retry → rate right → context → win', async ({ page }) => {
    await login(page);

    await page.goto(`${PLAYER_URL}/author/activities/${ACTIVITY_ID}/test`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="activity-test-harness"]').waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator('[data-testid="sandbox-chat"]').waitFor({ state: 'visible', timeout: 20_000 });

    // step0 (compose): send the vague ask as-is.
    await page.locator('[data-testid="sandbox-send"]').click();

    // step1 (evaluate): the vague answer is WEAK. Mis-rate "top" → retry → "ruim".
    await evaluate(page, 'ruim', 'top');

    // step2 (compose): the context choices unlock — pick the school-essay context, then send.
    await page.locator('[data-testid="sandbox-choices"]').waitFor({ state: 'visible', timeout: 15_000 });
    await page.locator('[data-testid="sandbox-choices"] button', { hasText: 'redação de escola' }).click();
    await page.locator('[data-testid="sandbox-send"]').click();

    // step3 (evaluate): the contextual answer is STRONG. Mis-rate "ruim" → retry → "top".
    await evaluate(page, 'top', 'ruim');

    // Win → reveal + Continuar → in-memory "Correct" verdict.
    await expect(page.locator('[data-testid="sandbox-reveal"]')).toBeVisible({ timeout: 10_000 });
    await page.locator('[data-testid="sandbox-continue"]').click();

    const verdict = page.locator('[data-testid="test-verdict"]');
    await expect(verdict).toBeVisible({ timeout: 10_000 });
    await expect(verdict).toHaveAttribute('data-correct', 'true');

    await page.screenshot({ path: 'e2e-sandbox-scenario-proof.png', fullPage: true });
  });
});
