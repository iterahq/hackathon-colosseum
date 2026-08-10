/**
 * THE FEEDBACK BAR USES THE WIDTH IT HAS.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 * ═══════════════════════════════════════════════════════════════════════════
 * Tainan, TG 2026-08-10, on a `terminal_sandbox` in the live class:
 * *"feedback tá com design quebrado (nao consome a largura disponivel)"*.
 * The authored recap wrapped into a ~110px sliver across fifteen lines while
 * the bar spanned the whole page. Measured on `main` at that commit, at a
 * 1280px viewport, in the author harness:
 *
 *   | box                              | before | after |
 *   |----------------------------------|--------|-------|
 *   | footer bar (`fixed inset-x-0`)   |  1280  |  1280 |
 *   | footer CONTENT ROW               |   672  |  1024 |
 *   | the activity column it judges    |   760  |   760 |
 *   | the explanation paragraph        |   442  |   794 |
 *
 * The row was NARROWER than the activity it comments on. That is the shape of
 * the complaint, and it is what the first assertion states.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY IT ASSERTS PIXELS AND NOT CLASS NAMES
 * ═══════════════════════════════════════════════════════════════════════════
 * A class-name assertion would have passed on the broken build: every class the
 * bar carried was the class it was written with. So would "the panel renders" —
 * this repo has already shipped an `AnswerExplanation` test that asserted a
 * component rendered without error while it rendered nothing at all. The only
 * assertion that can fail for the reason Tainan complained is a MEASUREMENT, and
 * jsdom has no layout (`getBoundingClientRect()` is all zeros there). Hence a
 * browser, and hence this file rather than `src/test/`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ WHAT THIS SUITE CANNOT REACH, STATED PLAINLY
 * ═══════════════════════════════════════════════════════════════════════════
 * Tainan's screenshot is the LIVE class, where the footer runs in WAIT mode:
 * no "Continuar" CTA, and a long "Pronto! Aguarde o professor avançar. · você
 * levou 11 segundos" hint as the verdict's row sibling. That sibling is what
 * squeezed the verdict hardest, because it is `flex-shrink-0`.
 *
 * Wait mode is NOT reachable hermetically: it exists only in `LiveSessionPage`,
 * which needs a class session, realtime and a roster — none of which
 * `harnessStub` stands up, and standing them up is a much larger change than
 * the fix. The author harness reaches the SAME component through its CTA mode,
 * and the two fixes it does prove (the row width, and the verdict block taking
 * the free space instead of absorbing the whole deficit) are the two that are
 * shared by both modes.
 *
 * The third fix — the `md:max-w-[50%]` cap that stops the wait hint from
 * starving the verdict — is covered by `LiveWaitWithRecap` in
 * `src/stories/FeedbackFooter.stories.tsx`, which reproduces the screenshot
 * exactly. It is a VITRINE, not a gate. Do not read this file as covering it.
 */
import { test, expect, type Page } from '@playwright/test';
import { ALL_FIXTURES, TERMINAL_FREE_TEXT, type ActivityFixture } from './support/activityFixtures';
import { installHarnessSubstrate, harnessUrl } from './support/harnessStub';

/**
 * The same free-text terminal, with a recap as long as the ones authors really
 * write — Tainan's own, verbatim from the screenshot.
 *
 * It is a LOCAL fixture, deliberately not added to `ALL_FIXTURES`: that registry
 * is the frozen input of the characterization baseline, and widening it would
 * move a baseline for a reason that has nothing to do with behaviour.
 *
 * The length is the point. A short recap sizes its paragraph to its own text, so
 * the paragraph's width stops reporting how much room the bar gave it — the
 * measurement would pass on a broken layout. Only text that OVERFLOWS its line
 * makes the paragraph width-bound, and therefore a witness.
 */
const LONG_RECAP =
  'O `git add .` prepara todos os arquivos da pasta de uma vez. Rápido — e por isso vale ' +
  'olhar o `git status` antes, para não levar junto o que você não quer. 🎉';

const TERMINAL_LONG_RECAP: ActivityFixture = (() => {
  const spec = JSON.parse(JSON.stringify(TERMINAL_FREE_TEXT.spec)) as Record<string, unknown>;
  const reveal = spec.reveal as { recap: Record<string, string> };
  reveal.recap = { pt: LONG_RECAP, en: LONG_RECAP };
  return {
    ...TERMINAL_FREE_TEXT,
    id: '00000000-0000-4000-9000-000000000900',
    label: 'terminal_sandbox (recap longo — largura do rodapé)',
    spec,
  };
})();

/** Drive the free-text terminal to its success step, so the footer settles. */
async function settleTerminal(page: Page): Promise<void> {
  await installHarnessSubstrate(page, [...ALL_FIXTURES, TERMINAL_LONG_RECAP]);
  await page.goto(harnessUrl(TERMINAL_LONG_RECAP));
  await expect(page.getByTestId('activity-test-harness')).toBeVisible();
  // A spec the Zod boundary rejects renders the invalid card — measuring THAT
  // screen would be measuring nothing.
  await expect(page.locator('[data-invalid-spec="true"]')).toHaveCount(0);

  const input = page.getByTestId('terminal-input');
  await input.fill('git checkout -b feat/perfil');
  await input.press('Enter');
  await input.fill('git status');
  await input.press('Enter');

  await expect(page.getByTestId('feedback-footer')).toBeVisible();
  await expect(page.getByTestId('feedback-footer-explanation')).toBeVisible();
  // The bar slides up on a spring. Measuring mid-animation reads a transform,
  // not a layout — wait for it to come to rest.
  await expect
    .poll(async () => (await page.getByTestId('feedback-footer').boundingBox())?.y ?? -1)
    .toBeGreaterThan(0);
  await page.waitForTimeout(600);
}

async function widthOf(page: Page, selector: string): Promise<number> {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} has no layout box`).not.toBeNull();
  return box!.width;
}

test.describe('the answer-feedback bar consumes the width it has', () => {
  test('at desktop width the bar is not narrower than the activity it judges', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await settleTerminal(page);

    // `<main>` IS the activity column on the harness route (`max-w-[760px]`).
    const column = await widthOf(page, 'main');
    const bar = await widthOf(page, '[data-testid="feedback-footer"]');
    const row = await widthOf(page, '[data-testid="feedback-footer"] > div');
    const explanation = await widthOf(page, '[data-testid="feedback-footer-explanation"]');

    // ── 1. The complaint, stated as geometry ──────────────────────────────
    // Feedback ABOUT an activity may not be rendered in a narrower column than
    // the activity. `max-w-2xl` (672) failed this against a 760px column;
    // `max-w-5xl` (1024) clears it. Written against the measured column and not
    // against a constant, so widening the harness column keeps it meaningful.
    expect(row).toBeGreaterThanOrEqual(column);

    // ── 2. "não consome a largura disponível", stated as geometry ─────────
    // The bar is `fixed inset-x-0`, so the width AVAILABLE to it is the whole
    // viewport. The explanation is its primary content, and it has to use a
    // real share of that — not a sliver with empty gutters on both sides.
    // Measured at this viewport: 442/1280 = 35% before, 794/1280 = 62% after.
    // 50% sits between them with ~13 points of room on each side.
    expect(explanation / bar).toBeGreaterThan(0.5);
  });

  /**
   * A REGRESSION GUARD, not a witness: it passed before the fix too. It is here
   * because "make the bar wider" is the change most likely to buy a desktop
   * improvement with a phone horizontal scroll, and the phone is where the
   * learner actually is.
   */
  test('at phone width the bar fills the viewport and does not overflow it', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 727 });
    await settleTerminal(page);

    const viewport = 393;
    const row = await widthOf(page, '[data-testid="feedback-footer"] > div');
    const explanation = await widthOf(page, '[data-testid="feedback-footer-explanation"]');

    // Below `md` the bar stacks, so the explanation owns the full measure minus
    // the icon and the horizontal padding. It must USE that width...
    expect(explanation / viewport).toBeGreaterThan(0.7);
    // ...and the row must not push the page into a horizontal scroll, which is
    // the failure mode a width fix most often trades for.
    expect(row).toBeLessThanOrEqual(viewport);
    const scrollsSideways = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(scrollsSideways).toBe(false);
  });
});
