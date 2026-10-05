/**
 * What the height specs share: the fixtures they open in the real lesson player
 * and how one viewport of it is measured. `mobile-height.spec.ts` reads it on a
 * phone, `laptop-height.spec.ts` on a short laptop screen.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
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
} from './activityFixtures';
import { LIVE_TYPE, SCENE_COPY, SCENE_TARGETS, TERA_PAGE, fixture } from './sceneFixtures';
import { installLessonSubstrate, lessonUrl } from './lessonStub';

/** Sub-pixel rounding plus a font fallback line; a real regression is a band, not 8 px. */
export const TOLERANCE = 8;

/** The x-ray scene of the report, with the guide's line as the author wrote it. */
export const XRAY_REPORTED = fixture(
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

export interface Case {
  fx: ActivityFixture;
  /** First element of the interactive area; defaults to the first control in the card. */
  target?: string;
}

export const CASES: Case[] = [
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

export async function measure(page: Page, target: string | undefined) {
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

export type Measured = Awaited<ReturnType<typeof measure>>;

export async function open(
  page: Page,
  fx: ActivityFixture,
  viewport: { width: number; height: number },
  title?: string,
): Promise<void> {
  await page.setViewportSize(viewport);
  await installLessonSubstrate(page, fx, title);
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

export function record(dir: string | undefined, label: string, sizes: Record<string, Measured>): void {
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  const file = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  fs.writeFileSync(path.join(dir, `${file}.json`), JSON.stringify({ label, ...sizes }, null, 1));
}
