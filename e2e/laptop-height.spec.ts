/**
 * How much of each activity a short laptop screen shows without scrolling.
 *
 * Tainan asked for the phone rule ("tudo aparece na tela do usuário, sem scroll;
 * um scroll leve não é problema") on the web too. The short screens are the
 * common cheap laptops: 1366x768 and 1280x720. Each fixture opens in the real
 * lesson player at both, and the overflow of the document at 1280x720 is compared
 * with the `laptop` budget in `support/heightBudget.json`.
 *
 * `LAPTOP_HEIGHT_RECORD=<dir>` also writes one JSON per fixture, which is where
 * the before/after tables come from.
 */
import { test, expect } from '@playwright/test';
import { CONCEPT } from './support/activityFixtures';
import { CASES, TOLERANCE, measure, open, record } from './support/heightMeasure';
import budget from './support/heightBudget.json' with { type: 'json' };

const HD = { width: 1366, height: 768 };
const SHORT = { width: 1280, height: 720 };
const BUDGET: Record<string, number> = budget.laptop;

/** Longer than any published lesson title: 88 characters. */
const LONG_TITLE = 'Dia 12 — Formulários acessíveis: rótulos, validação nativa e mensagens de erro que ajudam';

test.describe('a short laptop screen shows the activity without a long scroll', () => {
  for (const { fx, target } of CASES) {
    test(`${fx.label} stays inside its height budget at 1280x720`, async ({ page }) => {
      await open(page, fx, HD);
      const hd = await measure(page, target);
      await page.setViewportSize(SHORT);
      await page.waitForTimeout(250);
      const short = await measure(page, target);
      record(process.env.LAPTOP_HEIGHT_RECORD, fx.label, { hd, short });

      const allowed = BUDGET[fx.label];
      expect(allowed, `no laptop height budget recorded for "${fx.label}" in e2e/support/heightBudget.json`).toBeDefined();
      expect(
        short.overflow,
        `"${fx.label}" scrolls ${short.overflow} px at 1280x720; its budget is ${allowed} px (+${TOLERANCE}). ` +
          `Bands now: ${JSON.stringify(short.bands)}. If the extra height is intended, record the new value in e2e/support/heightBudget.json.`,
      ).toBeLessThanOrEqual(allowed === 0 ? 0 : allowed + TOLERANCE);
    });
  }

  for (const width of [640, 768, 1024, 1280]) {
    test(`a long lesson title takes one line at ${width} px and keeps its full text`, async ({ page }) => {
      await open(page, CONCEPT, { width, height: 768 }, LONG_TITLE);
      const title = page.getByTestId('lesson-title');
      const { height, lineHeight, clipped } = await title.evaluate((el) => ({
        height: el.getBoundingClientRect().height - parseFloat(getComputedStyle(el).paddingBottom),
        lineHeight: parseFloat(getComputedStyle(el).lineHeight),
        clipped: el.scrollWidth > el.clientWidth,
      }));
      expect(height).toBeLessThanOrEqual(lineHeight + 1);
      if (clipped) await expect(title).toHaveAttribute('title', LONG_TITLE);
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(LONG_TITLE);
    });
  }
});
