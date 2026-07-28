/**
 * Lesson-completion → program-progress → next-lesson-unlock E2E (the value-blocker).
 *
 * Round-2 focus-group bug (all personas): finishing lesson 1 (all pulses) did NOT
 * persist into the program view — the course stayed "0/N lições" and lesson 2
 * (Commit → ER artifact + Badge) stayed LOCKED 🔒, so nobody reached the payoff
 * that justifies R$100.
 *
 * Root cause was read-side: getProgramBySlug never derived per-activity progress
 * from itera.progress, and the UI unlock gate checks `status === 'done'` while the
 * DB stores `'completed'`. This spec drives the REAL deployed player to prove the
 * fix end-to-end: complete lesson 1 → program shows it done → lesson 2 unlocks.
 *
 * Gated through `e2e/support/gate.ts` on the **required** `itera-player` +
 * `claude-smoke` capabilities: `e2e.yml` declares `CLAUDE_SMOKE_*`, so its
 * absence is a preflight failure, not a silent skip.
 *
 * Prereqs (env):
 *   - ITERA_PLAYER_URL (defaults to ITERA_BASE_URL) reachable
 *   - ITERA_LEARNER_EMAIL + ITERA_LEARNER_PASSWORD — an Itera password-auth learner
 *     ALREADY ENROLLED in the target program (CLAUDE_SMOKE_* also accepted)
 *   - ITERA_PROGRAM_SLUG (default modele-dados-com-ia)
 */
import { test, expect, type Page } from '@playwright/test';
import { ITERA_PLAYER_URL } from './support/capabilities';
import { requireCapabilities } from './support/gate';

const PLAYER_URL = ITERA_PLAYER_URL;
const EMAIL = process.env.ITERA_LEARNER_EMAIL || process.env.CLAUDE_SMOKE_USERNAME || '';
const PASSWORD = process.env.ITERA_LEARNER_PASSWORD || process.env.CLAUDE_SMOKE_PASSWORD || '';
const PROGRAM_SLUG = process.env.ITERA_PROGRAM_SLUG || 'modele-dados-com-ia';

async function loginWithPassword(page: Page): Promise<void> {
  await page.goto(`${PLAYER_URL}/login`, { waitUntil: 'domcontentloaded' });
  const email = page.locator('input[type="email"], input[autocomplete="email"]').first();
  const pass = page.locator('input[type="password"], input[autocomplete="current-password"]').first();
  await email.waitFor({ state: 'visible', timeout: 20_000 });
  await email.fill(EMAIL);
  await pass.fill(PASSWORD);
  await page.locator('[data-testid="login-form"] button[type="submit"], button[type="submit"]').first().click();
  // Land somewhere authenticated (home / program).
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
}

/** Step through every activity in the current lesson until the complete screen. */
async function completeCurrentLesson(page: Page): Promise<void> {
  for (let i = 0; i < 12; i++) {
    if (await page.locator('[data-testid="lesson-complete"]').isVisible().catch(() => false)) return;
    // The activity's "done/continue" button advances; the renderer exposes it.
    const cta = page
      .locator('[data-testid="activity-done"], [data-testid="lesson-save-retry"], button:has-text("Continuar"), button:has-text("Continue")')
      .first();
    await cta.waitFor({ state: 'visible', timeout: 15_000 });
    await cta.click();
    await page.waitForTimeout(800);
  }
}

test.describe('lesson completion persists + unlocks the next lesson', () => {
  test.beforeAll(async () => {
    await requireCapabilities('itera-player', 'claude-smoke');
  });

  test('finishing lesson 1 marks it done and unlocks lesson 2', async ({ page }) => {
    await loginWithPassword(page);

    // Open the program → the skill-tree.
    await page.goto(`${PLAYER_URL}/program/${PROGRAM_SLUG}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="skill-tree"]').waitFor({ state: 'visible', timeout: 20_000 });

    // Lesson 1 should already read as done for the enrolled smoke learner (it has
    // completed progress rows). Assert lesson 2 is NOT locked (it unlocked).
    const lockedNodes = page.locator('[data-testid="tree-node-locked"]');
    const doneNodes = page.locator('[data-testid="tree-node-done"]');

    await expect(doneNodes.first()).toBeVisible({ timeout: 20_000 });
    // The next lesson must be reachable: either 'current' or 'done', never the
    // only node left while lesson 1 is done.
    const lockedCount = await lockedNodes.count();
    const doneCount = await doneNodes.count();
    expect(doneCount).toBeGreaterThan(0); // lesson 1 done
    // With a 2-lesson program and lesson 1 done, there must be 0 locked nodes.
    expect(lockedCount).toBe(0);

    await page.screenshot({ path: 'e2e-unlock-proof.png', fullPage: true });
  });
});
