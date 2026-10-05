/**
 * How much of each activity a phone shows without scrolling.
 *
 * Tainan, on an iPhone (2026-10-05): "Precisamos ganhar altura. Ideal: tudo
 * aparece na tela do usuário, sem scroll. Um scroll leve não é problema."
 *
 * Each fixture opens in the real lesson player and is measured at 390x844 and at
 * 390x640 — the short phone `mobile-web-details` asks for (VP-5), which is 24 px
 * stricter than an iPhone with both Safari bars showing (664). The overflow of
 * the document at 390x640 is compared with the budget recorded in
 * `support/heightBudget.json`: a change that adds height on a phone fails here
 * and names the band that grew.
 *
 * `HEIGHT_PASS_RECORD=<dir>` also writes one JSON per fixture, which is where the
 * before/after tables come from.
 */
import { test, expect } from '@playwright/test';
import { CODE_WITH_CHECKS, CONCEPT, SINGLE_CHOICE } from './support/activityFixtures';
import { CASES, TOLERANCE, XRAY_REPORTED, measure, open as openAt, record } from './support/heightMeasure';
import type { ActivityFixture } from './support/activityFixtures';
import type { Page } from '@playwright/test';
import budget from './support/heightBudget.json' with { type: 'json' };

const TALL = { width: 390, height: 844 };
const SHORT = { width: 390, height: 640 };

const open = (page: Page, fx: ActivityFixture) => openAt(page, fx, TALL);

const BUDGET: Record<string, number> = budget.phone;

test.describe('a phone shows the activity without a long scroll', () => {
  for (const { fx, target } of CASES) {
    test(`${fx.label} stays inside its height budget at 390x640`, async ({ page }) => {
      await open(page, fx);
      const tall = await measure(page, target);
      await page.setViewportSize(SHORT);
      await page.waitForTimeout(250);
      const short = await measure(page, target);
      record(process.env.HEIGHT_PASS_RECORD, fx.label, { tall, short });

      const allowed = BUDGET[fx.label];
      expect(allowed, `no height budget recorded for "${fx.label}" in e2e/support/heightBudget.json`).toBeDefined();
      expect(
        short.overflow,
        `"${fx.label}" scrolls ${short.overflow} px at 390x640; its budget is ${allowed} px (+${TOLERANCE}). ` +
          `Bands now: ${JSON.stringify(short.bands)}. If the extra height is intended, record the new value in e2e/support/heightBudget.json.`,
      ).toBeLessThanOrEqual(allowed === 0 ? 0 : allowed + TOLERANCE);
    });
  }

  test('the lesson title takes one line and keeps its full text for assistive tech', async ({ page }) => {
    await open(page, CONCEPT);
    const title = page.getByTestId('lesson-title');
    const { height, lineHeight, clipped } = await title.evaluate((el) => ({
      height: el.getBoundingClientRect().height - parseFloat(getComputedStyle(el).paddingBottom),
      lineHeight: parseFloat(getComputedStyle(el).lineHeight),
      clipped: el.scrollWidth > el.clientWidth,
    }));
    expect(height).toBeLessThanOrEqual(lineHeight + 1);
    if (clipped) await expect(title).toHaveAttribute('title', /tags e esqueleto$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(/tags e esqueleto$/);
  });

  test('the guide speaks across the whole card and keeps his face', async ({ page }) => {
    await open(page, XRAY_REPORTED);
    const card = (await page.getByTestId('scene-frame').boundingBox())!;
    const bubble = (await page.getByTestId('scene-guide-text').boundingBox())!;
    expect(bubble.width / card.width).toBeGreaterThan(0.8);
    const face = page.getByTestId('scene-guide').locator('[data-tera]');
    await expect(face).toBeVisible();
    await expect(face).toHaveAttribute('data-tera', 'neutral');
  });

  test('the verdict footer does not cover the card and nothing is reserved while it is down', async ({ page }) => {
    await open(page, SINGLE_CHOICE);
    const idle = await measure(page, undefined);
    expect(idle.bands.bottomReserve).toBeLessThanOrEqual(32);

    await page.getByTestId('single-choice-option').first().click();
    await page.getByTestId('single-choice-submit').click();
    const footer = page.getByTestId('feedback-footer');
    await expect(footer).toBeVisible();
    // The bar rises on a spring; a box read mid-flight is a transform, not a layout.
    await expect
      .poll(async () => {
        const box = (await footer.boundingBox())!;
        return Math.abs(box.y + box.height - TALL.height);
      })
      .toBeLessThan(1);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const footerBox = (await footer.boundingBox())!;
    const submit = (await page.getByTestId('single-choice-submit').boundingBox())!;
    expect(submit.y + submit.height).toBeLessThanOrEqual(footerBox.y);
    const reserve = (await measure(page, undefined)).bands.bottomReserve;
    expect(reserve).toBeGreaterThanOrEqual(footerBox.height);
    expect(reserve).toBeLessThanOrEqual(footerBox.height + 32);
  });

  test('code shows one pane at a time and still grades from the code pane', async ({ page }) => {
    await open(page, CODE_WITH_CHECKS);
    const editor = page.locator('[data-stage-cursor-source]');
    const preview = page.locator('iframe');
    await expect(editor).toBeVisible();
    await expect(preview).toBeHidden();
    const hiddenBox = await preview.evaluate((el) => el.getBoundingClientRect().height);
    expect(hiddenBox).toBeGreaterThan(200);

    await page.getByTestId('code-pane-preview').tap();
    await expect(preview).toBeVisible();
    await expect(editor).toBeHidden();
    await expect(page.getByTestId('code-pane-preview')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('code-pane-code').tap();
    await page.getByTestId('code-submit').tap();
    await expect(page.getByTestId('lesson-activity')).not.toHaveAttribute('data-activity-id', CODE_WITH_CHECKS.id);
  });
});
