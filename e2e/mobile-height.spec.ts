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
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import {
  CHAT_SANDBOX,
  CODE_NO_CHECKS,
  CODE_WITH_CHECKS,
  CONCEPT,
  CONCEPT_REVEAL,
  DIAGRAM,
  DOCUMENT_READONLY,
  DOCUMENT_REFLECTION,
  MATCH,
  MULTI_CHOICE,
  ORDER,
  QUIZ,
  SINGLE_CHOICE,
  TERMINAL_FREE_TEXT,
  TERMINAL_OPTIONS,
  VIDEO,
  type ActivityFixture,
} from './support/activityFixtures';
import { LIVE_TYPE, SCENE_COPY, SCENE_TARGETS, TERA_PAGE, fixture } from './support/sceneFixtures';
import { installLessonSubstrate, lessonUrl } from './support/lessonStub';
import budget from './support/heightBudget.json' with { type: 'json' };

const TALL = { width: 390, height: 844 };
const SHORT = { width: 390, height: 640 };
/** Sub-pixel rounding plus a font fallback line; a real regression is a band, not 8 px. */
const TOLERANCE = 8;

/** The x-ray scene of the report, with the guide's line as the author wrote it. */
const XRAY_REPORTED = fixture(
  30,
  'xray',
  {
    ...SCENE_COPY,
    prompt:
      'Por trás dessa página está o HTML. Passe o mouse por cima dela (no celular, passe o dedo) e veja a mágica que está escondida atrás da tela. Vá do título até a frase!',
    page: TERA_PAGE,
  },
  'xray (fala longa do guia)',
);

interface Case {
  fx: ActivityFixture;
  /** First element of the interactive area; defaults to the first control in the card. */
  target?: string;
}

const CASES: Case[] = [
  { fx: CONCEPT },
  { fx: CONCEPT_REVEAL },
  { fx: DOCUMENT_READONLY },
  { fx: DOCUMENT_REFLECTION, target: 'textarea' },
  { fx: DIAGRAM },
  { fx: VIDEO },
  { fx: QUIZ, target: '[data-testid="quiz-option"]' },
  { fx: SINGLE_CHOICE, target: '[data-testid="single-choice-option"]' },
  { fx: MULTI_CHOICE, target: '[data-testid="multi-choice-option"]' },
  { fx: MATCH, target: '[data-testid="match-left-card"]' },
  { fx: ORDER, target: '[data-testid="order-item"]' },
  { fx: CODE_NO_CHECKS },
  { fx: CODE_WITH_CHECKS },
  { fx: TERMINAL_FREE_TEXT, target: '[data-testid="terminal-input"]' },
  { fx: TERMINAL_OPTIONS },
  { fx: CHAT_SANDBOX },
  { fx: XRAY_REPORTED, target: '[data-testid="xray-page"] [data-scene-tag="h1"]' },
  ...SCENE_TARGETS.map(({ fx, target }) => ({ fx, target })),
  { fx: LIVE_TYPE, target: '[data-testid="live-type-input"]' },
];

const ACTION = '[data-testid="concept-continue"], [data-testid$="-submit"], [data-testid="activity-done"]';
const CONTROL = 'button, input, textarea, select, [role="slider"], [role="button"]';

async function measure(page: Page, target: string | undefined) {
  return page.evaluate(
    ({ target, ACTION, CONTROL }) => {
      window.scrollTo(0, 0);
      const one = (selector: string, root: ParentNode = document) => root.querySelector<HTMLElement>(selector);
      // A band folded to `sr-only` is 1 px tall and reads as absent.
      const visible = (el: HTMLElement) => el.getBoundingClientRect().height > 1;
      const rect = (el: Element | null | undefined) => el?.getBoundingClientRect();
      const px = (n: number | undefined) => (n === undefined ? 0 : Math.round(n));

      const main = one('[data-testid="lesson-main"]')!;
      const activity = one('[data-testid="lesson-activity"]')!;
      const shell = one('[data-testid="activity-shell"]', activity);
      const title = rect(one('[data-testid="lesson-title"]'));
      const eyebrow = one('[data-testid="lesson-eyebrow"]');
      const badge = shell && (one('[data-testid="kind-badge"]', shell) ?? one(':scope > span.inline-flex', shell));
      const badgeNext = badge?.nextElementSibling;
      const actions = [...main.querySelectorAll<HTMLElement>(ACTION)].filter(visible);
      const targets = [...activity.querySelectorAll<HTMLElement>(target ?? CONTROL)].filter(visible);
      const action = actions.at(-1) ?? targets.at(-1) ?? activity;
      const style = getComputedStyle(main);

      return {
        viewport: window.innerHeight,
        overflow: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
        interactiveTop: px((targets[0] ?? actions[0] ?? activity).getBoundingClientRect().top),
        actionBottom: px(action.getBoundingClientRect().bottom),
        bands: {
          progress: px(rect(one('[data-testid="lesson-progress"]'))?.height),
          controls: px(parseFloat(style.paddingTop)),
          eyebrow: eyebrow && visible(eyebrow) && title ? px(title.top - eyebrow.getBoundingClientRect().top) : 0,
          title: px(title?.height),
          titleToCard: px(activity.getBoundingClientRect().top - (title?.bottom ?? 0)),
          badge: badge && visible(badge) && badgeNext ? px(badgeNext.getBoundingClientRect().top - badge.getBoundingClientRect().top) : 0,
          guide: px(rect(one('[data-testid="scene-guide"]', activity))?.height),
          instruction: px(rect(one('[data-testid="instruction-panel"]', activity))?.height),
          card: px(activity.getBoundingClientRect().height),
          bottomReserve: px(parseFloat(style.paddingBottom)),
        },
      };
    },
    { target, ACTION, CONTROL },
  );
}

type Measured = Awaited<ReturnType<typeof measure>>;

async function open(page: Page, fx: ActivityFixture): Promise<void> {
  await page.setViewportSize(TALL);
  await installLessonSubstrate(page, fx);
  await page.goto(lessonUrl(fx));
  await expect(page.getByTestId('lesson-activity')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-invalid-spec="true"]')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  // The card rises 12 px on a spring and async panes (Monaco, Mermaid, the terminal) size late.
  await expect
    .poll(
      async () => {
        const before = await page.evaluate(() => document.documentElement.scrollHeight);
        await page.waitForTimeout(400);
        return (await page.evaluate(() => document.documentElement.scrollHeight)) === before;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}

function record(label: string, tall: Measured, short: Measured): void {
  const dir = process.env.HEIGHT_PASS_RECORD;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  const file = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  fs.writeFileSync(path.join(dir, `${file}.json`), JSON.stringify({ label, tall, short }, null, 1));
}

const BUDGET: Record<string, number> = budget;

test.describe('a phone shows the activity without a long scroll', () => {
  for (const { fx, target } of CASES) {
    test(`${fx.label} stays inside its height budget at 390x640`, async ({ page }) => {
      await open(page, fx);
      const tall = await measure(page, target);
      await page.setViewportSize(SHORT);
      await page.waitForTimeout(250);
      const short = await measure(page, target);
      record(fx.label, tall, short);

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
      height: el.getBoundingClientRect().height,
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
});
