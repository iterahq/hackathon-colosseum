/**
 * READ-SIDE proof: persisted progress becomes a `done` node, and the next
 * lesson unlocks.
 *
 * Round-2 focus-group bug (all personas): finishing lesson 1 (all pulses) did NOT
 * persist into the program view — the course stayed "0/N lições" and lesson 2
 * (Commit → ER artifact + Badge) stayed LOCKED 🔒, so nobody reached the payoff
 * that justifies R$100.
 *
 * The root cause was **read-side**: `getProgramBySlug` never derived per-activity
 * progress from `itera.progress`, and the UI unlock gate checked `status === 'done'`
 * while the DB stores `'completed'`. That mapping is what this spec proves, against
 * the real deployed player.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ WHAT THIS SPEC DOES **NOT** PROVE — read before renaming it back
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * It does not exercise the WRITE path. It asserts on progress rows that already
 * exist for the smoke learner; it settles no attempt and writes nothing.
 *
 * Until 2026-08-13 the test was named *"finishing lesson 1 marks it done and
 * unlocks lesson 2"* and carried a `completeCurrentLesson()` helper that **was
 * never called**. The name promised a write-path proof, the body performed a
 * read-only assertion on state written on 2026-06-26, and the test would have
 * stayed green if `persistActivityProgress` had been deleted outright. The dead
 * helper survived because `@typescript-eslint/no-unused-vars` was `off`
 * repo-wide; `eslint.config.js` now turns it back on for `e2e/**` precisely so a
 * spec cannot again declare the work it does not do.
 *
 * Measured the same day, and it is the reason the rename is not cosmetic: one
 * full suite run against production moved exactly ONE table in the whole `itera`
 * schema — `class_sessions` (+3, all as the `itera-smoke` tenant_admin). Zero
 * rows in `activity_results`, `activity_traces`, `progress`, `class_answers`,
 * `xp_events` and `artifacts`.
 *
 * ⚠️ AND THE HELPER COULD NOT HAVE WORKED, so do not "fix" this by calling it.
 * The smoke learner has already completed this lesson. `LessonPlayer` reads
 * `itera.progress` on mount and, when every activity is `completed`, seeks
 * straight to the completion screen (`resumeIndexFor` → `setCompleted(true)`);
 * a revisited activity is `done`, therefore locked by `answerMachine`
 * (`done → locked → !acceptsSubmit`), therefore unanswerable. That suppression is
 * INTENDED — the lesson reopens as a book — and it is consistent in a third
 * place (`abandonment.ts`: `if (reviewing) return 'reviewing'`). So the helper
 * would have found `lesson-complete` on its first iteration and clicked nothing.
 *
 * A repeatable write-path spec therefore cannot be built on "complete lesson 1
 * again". It has to run on a path that is idempotent BY CONSTRUCTION — a wrong
 * answer, which writes `activity_results` on every attempt and never promotes
 * `progress` to `completed`. That is tracked as its own task on plan
 * 20260812-ux-map-observed-reality-lens.
 *
 * Gated through `e2e/support/gate.ts` on the **required** `itera-player` +
 * `claude-smoke` capabilities: `e2e.yml` declares `CLAUDE_SMOKE_*`, so its
 * absence is a preflight failure, not a silent skip.
 *
 * Prereqs (env):
 *   - ITERA_PLAYER_URL (defaults to ITERA_BASE_URL) reachable
 *   - ITERA_LEARNER_EMAIL + ITERA_LEARNER_PASSWORD — an Itera password-auth learner
 *     ALREADY ENROLLED in the target program, with lesson 1 already completed
 *     (CLAUDE_SMOKE_* also accepted)
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

test.describe('persisted progress renders as done and unlocks the next lesson', () => {
  test.beforeAll(async () => {
    await requireCapabilities('itera-player', 'claude-smoke');
  });

  test('a lesson with completed progress reads as done, and no lesson stays locked', async ({ page }) => {
    await loginWithPassword(page);

    // Open the program → the skill-tree.
    await page.goto(`${PLAYER_URL}/program/${PROGRAM_SLUG}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="skill-tree"]').waitFor({ state: 'visible', timeout: 20_000 });

    const lockedNodes = page.locator('[data-testid="tree-node-locked"]');
    const doneNodes = page.locator('[data-testid="tree-node-done"]');
    const currentNodes = page.locator('[data-testid="tree-node-current"]');

    await expect(doneNodes.first()).toBeVisible({ timeout: 20_000 });

    const lockedCount = await lockedNodes.count();
    const doneCount = await doneNodes.count();
    const currentCount = await currentNodes.count();

    // ⚠️ NON-VACUITY FIRST. `lockedCount === 0` is satisfied just as well by a
    // tree that rendered NO nodes at all — an empty program, a failed query, a
    // renamed testid. Assert the tree exists before reading anything into the
    // absence of locks; without this line the interesting assertion below can
    // pass for the least interesting reason.
    const totalNodes = doneCount + currentCount + lockedCount;
    expect(totalNodes, 'the skill-tree rendered no lesson nodes at all').toBeGreaterThan(0);

    // The read-side mapping under test: `itera.progress.status = 'completed'`
    // must surface as the tree state `done`. When this regresses, the row is
    // still in the database and the learner still sees "0/N lições".
    expect(doneCount, 'no lesson read as done despite completed progress rows').toBeGreaterThan(0);

    // …and the unlock that the completion is supposed to buy.
    expect(lockedCount, 'a lesson is still locked while an earlier one is done').toBe(0);

    await page.screenshot({ path: 'e2e-unlock-proof.png', fullPage: true });
  });
});
