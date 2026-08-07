/**
 * TERMINAL SANDBOX — the refinements only a real browser can adjudicate.
 * Plan `20260807-itera-terminal-sandbox-refinamentos`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE IS NOT `activity-baseline.spec.ts`
 * ═══════════════════════════════════════════════════════════════════════════
 * That suite is a frozen CHARACTERIZATION baseline: its contract is "a red run
 * means behaviour moved", and it is deliberately blind to whether the behaviour
 * it froze is good. This file is the opposite — every assertion here states
 * what the terminal MUST do, and each one was written because a screenshot
 * showed it not doing it.
 *
 * They share everything else: the same hermetic substrate (`harnessStub`), the
 * same credential-free `vite preview` of the code under test, the same blocking
 * `ci.yml` job (`playwright.baseline.config.ts` matches both files).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A BROWSER AND NOT VITEST
 * ═══════════════════════════════════════════════════════════════════════════
 * jsdom has no layout: every `getBoundingClientRect()` is zero, so the very
 * property §1 of the plan is about — WHERE the prompt sits — is unobservable
 * there. `src/test/TerminalSandboxActivity.test.tsx` keeps the verdict/trace
 * assertions (which need no pixels); geometry lives here, measured.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  ALL_FIXTURES,
  TERMINAL_FREE_TEXT,
  TERMINAL_OPTIONS,
  type ActivityFixture,
} from './support/activityFixtures';
import { installHarnessSubstrate, harnessUrl } from './support/harnessStub';

/** Open a terminal fixture in the author harness, mounted and dispatched. */
async function open(page: Page, fx: ActivityFixture): Promise<void> {
  await installHarnessSubstrate(page, ALL_FIXTURES);
  await page.goto(harnessUrl(fx));
  await expect(page.getByTestId('activity-test-harness')).toBeVisible();
  // A spec that failed its Zod boundary renders the invalid card — asserting
  // against that screen would be asserting about nothing.
  await expect(page.locator('[data-invalid-spec="true"]')).toHaveCount(0);
  await expect(page.getByTestId('terminal-transcript')).toBeVisible();
}

/* ══════════════════════════════════════════════════════════════════════════
 * §1 — THE PROMPT IS BORN AT THE TOP
 *
 * The transcript used to be a FIXED `h-[34dvh] min-h-[220px]` pane, so on the
 * first frame the window reserved ~220px for one welcome line and parked the
 * prompt at the bottom of it. The learner met a dead gap between the context
 * line and the cursor. A terminal grows DOWNWARD: the cursor starts glued to
 * the last line and the history pushes it.
 *
 * ── WHY NOT THE PLAN'S LITERAL PROXY ───────────────────────────────────────
 * The plan proposed "the input box's `top` is less than half the panel height".
 * That proxy is UNSATISFIABLE once the fix lands, and it was already failing
 * before it — measured on Desktop Chrome, `sandbox-window` at y=355:
 *
 *   before the fix:  window height ~332px (36 chrome + 220 reserved + prompt),
 *                    prompt top ~639  vs midline ~521  → BELOW the midline
 *   after  the fix:  window height  152px, prompt top 462 vs midline 431
 *                    → still BELOW the midline
 *
 * The reason is structural: the prompt bar is the LAST child of a window that
 * now shrinks to its content, so it necessarily occupies the bottom slice. The
 * midline says nothing about the gap — it only measures how much history there
 * is. What actually distinguishes the two screenshots is SLACK: 199px of
 * reserved emptiness before, 0px after. So that is what is asserted here, on
 * both surfaces, plus the gap to the prompt and the downward growth.
 * ══════════════════════════════════════════════════════════════════════════ */

async function boxOf(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox();
  expect(box, `${testId} must have a layout box`).not.toBeNull();
  return box!;
}

for (const fx of [TERMINAL_FREE_TEXT, TERMINAL_OPTIONS]) {
  const surface = fx === TERMINAL_FREE_TEXT ? 'freeText' : 'options';
  const promptTestId = surface === 'freeText' ? 'terminal-input' : 'terminal-draft';

  test(`§1 ${surface}: the transcript reserves no empty space`, async ({ page }) => {
    await open(page, fx);

    const transcript = await boxOf(page, 'terminal-transcript');
    const lastLine = await boxOf(page, 'transcript-last-line');

    // How much of the transcript box is blank below its own content.
    const slack = transcript.height - (lastLine.y + lastLine.height - transcript.y);
    expect(slack, `transcript reserved ${slack}px of empty space below its content`).toBeLessThan(
      8,
    );
  });

  test(`§1 ${surface}: no dead gap between the last line and the prompt`, async ({ page }) => {
    await open(page, fx);

    const lastLine = await boxOf(page, 'transcript-last-line');
    const promptBox = await boxOf(page, promptTestId);

    const gap = promptBox.y - (lastLine.y + lastLine.height);
    expect(gap, `gap between last transcript line and prompt was ${gap}px`).toBeLessThan(48);
    expect(gap).toBeGreaterThanOrEqual(0);
  });
}

test('§1 the transcript GROWS downward as commands land', async ({ page }) => {
  await open(page, TERMINAL_FREE_TEXT);

  const before = await boxOf(page, 'terminal-input');
  const input = page.getByTestId('terminal-input');
  await input.fill('git checkout -b feat/perfil');
  await input.press('Enter');
  await expect(page.getByTestId('terminal-transcript')).toContainText('feat/perfil');

  const after = await boxOf(page, 'terminal-input');
  // The history pushed the prompt DOWN. A fixed-height pane would leave it put,
  // which is exactly the regression this file exists to catch.
  expect(after.y).toBeGreaterThan(before.y);
});
