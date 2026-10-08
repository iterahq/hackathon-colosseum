import { test, expect, type Page } from '@playwright/test';
import {
  CODE_WITH_FAILING_CHECKS,
  DOCUMENT_REFLECTION,
  MATCH,
  MULTI_CHOICE,
  ORDER,
  SINGLE_CHOICE,
  TERMINAL_FREE_TEXT,
  type ActivityFixture,
} from './support/activityFixtures';
import { STUB_SUPABASE_URL } from './support/harnessStub';
import { installLessonSubstrate, lessonUrl } from './support/lessonStub';
import { dragOrderRow } from './support/orderDrag';

const option = (page: Page, id: string) =>
  page.locator(`[data-testid="single-choice-option"][data-option-id="${id}"]`);
const shownActivity = (page: Page) => page.getByTestId('lesson-activity').getAttribute('data-activity-id');

/** True once the attempt is durable; reloading before that replays it, by design. */
const answerSaved = (page: Page, activityId: string) =>
  page.evaluate((id) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('itera.lesson.answers:'));
    const stored = key ? (JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, { saved?: boolean }>) : {};
    return stored[id]?.saved === true;
  }, activityId);

function countAttemptWrites(page: Page): { passed: boolean[] } {
  const log = { passed: [] as boolean[] };
  page.on('request', (request) => {
    if (request.method() !== 'POST') return;
    if (!request.url().startsWith(`${STUB_SUPABASE_URL}/rest/v1/activity_results`)) return;
    log.passed.push((request.postDataJSON() as { passed: boolean }).passed);
  });
  return log;
}

test.describe('an answered exercise survives a reload', () => {
  test('a miss is written before Continue, stays locked after a reload, and retries only on demand', async ({ page }) => {
    await installLessonSubstrate(page, SINGLE_CHOICE);
    const writes = countAttemptWrites(page);
    await page.goto(lessonUrl(SINGLE_CHOICE));

    await option(page, 'b').click();
    await page.getByTestId('single-choice-submit').click();
    await expect(page.getByTestId('feedback-footer')).toBeVisible();
    await expect.poll(() => writes.passed).toEqual([false]);
    await expect.poll(() => answerSaved(page, SINGLE_CHOICE.id)).toBe(true);

    await page.reload();
    await expect(page.getByTestId('lesson-activity')).toBeVisible();
    expect(await shownActivity(page)).not.toBe(SINGLE_CHOICE.id);

    await page.getByTestId('lesson-prev').click();
    await expect.poll(() => shownActivity(page)).toBe(SINGLE_CHOICE.id);
    await expect(option(page, 'b')).toHaveAttribute('data-state', 'wrong');
    await expect(option(page, 'b')).toBeDisabled();
    await expect(page.getByTestId('lesson-retry-missed')).toBeVisible();
    expect(writes.passed).toEqual([false]);

    await page.getByTestId('lesson-retry-missed').click();
    await expect(page.getByTestId('lesson-retry-missed')).toHaveCount(0);
    await expect(option(page, 'b')).toHaveAttribute('data-state', 'idle');
    await option(page, 'a').click();
    await page.getByTestId('single-choice-submit').click();
    await expect.poll(() => writes.passed).toEqual([false, true]);
  });

  test('a hit is written before Continue and is not asked again after a reload', async ({ page }) => {
    await installLessonSubstrate(page, SINGLE_CHOICE);
    const writes = countAttemptWrites(page);
    await page.goto(lessonUrl(SINGLE_CHOICE));

    await option(page, 'a').click();
    await page.getByTestId('single-choice-submit').click();
    await expect(page.getByTestId('feedback-footer')).toBeVisible();
    await expect.poll(() => writes.passed).toEqual([true]);
    await expect.poll(() => answerSaved(page, SINGLE_CHOICE.id)).toBe(true);

    await page.reload();
    await expect(page.getByTestId('lesson-activity')).toBeVisible();
    expect(await shownActivity(page)).not.toBe(SINGLE_CHOICE.id);

    await page.getByTestId('lesson-prev').click();
    await expect.poll(() => shownActivity(page)).toBe(SINGLE_CHOICE.id);
    await expect(option(page, 'a')).toHaveAttribute('data-state', 'correct');
    await expect(page.getByTestId('lesson-retry-missed')).toHaveCount(0);
    expect(writes.passed).toEqual([true]);
  });
});

/** A device that never saw the answer: same account, empty local record. */
const forgetLocalAnswers = (page: Page) =>
  page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('itera.lesson.answers:')) localStorage.removeItem(key);
    }
  });

test.describe('an answered exercise follows the learner to another device', () => {
  test('a miss re-opens locked on the option picked elsewhere, read back from the attempt log', async ({ page }) => {
    await installLessonSubstrate(page, SINGLE_CHOICE);
    const writes = countAttemptWrites(page);
    await page.goto(lessonUrl(SINGLE_CHOICE));

    await option(page, 'b').click();
    await page.getByTestId('single-choice-submit').click();
    await expect.poll(() => answerSaved(page, SINGLE_CHOICE.id)).toBe(true);

    await forgetLocalAnswers(page);
    await page.reload();
    await expect(page.getByTestId('lesson-activity')).toBeVisible();
    expect(await shownActivity(page)).not.toBe(SINGLE_CHOICE.id);

    await page.getByTestId('lesson-prev').click();
    await expect.poll(() => shownActivity(page)).toBe(SINGLE_CHOICE.id);
    await expect(option(page, 'b')).toHaveAttribute('data-state', 'wrong');
    await expect(option(page, 'b')).toBeDisabled();
    await expect(page.getByTestId('lesson-retry-missed')).toBeVisible();
    // Reading the log back is not an attempt.
    expect(writes.passed).toEqual([false]);
  });

  test('a hit re-opens on the option picked elsewhere', async ({ page }) => {
    await installLessonSubstrate(page, SINGLE_CHOICE);
    await page.goto(lessonUrl(SINGLE_CHOICE));

    await option(page, 'a').click();
    await page.getByTestId('single-choice-submit').click();
    await expect.poll(() => answerSaved(page, SINGLE_CHOICE.id)).toBe(true);

    await forgetLocalAnswers(page);
    await page.reload();
    await expect(page.getByTestId('lesson-activity')).toBeVisible();
    await page.getByTestId('lesson-prev').click();
    await expect.poll(() => shownActivity(page)).toBe(SINGLE_CHOICE.id);
    await expect(option(page, 'a')).toHaveAttribute('data-state', 'correct');
    await expect(option(page, 'a')).toHaveAttribute('data-selected', 'true');
    await expect(page.getByTestId('lesson-retry-missed')).toHaveCount(0);
  });
});

test.describe('a finished exercise can be done again', () => {
  test('"Refazer" reopens it blank, shows the verdict, and writes no second attempt', async ({ page }) => {
    await installLessonSubstrate(page, SINGLE_CHOICE);
    const writes = countAttemptWrites(page);
    await page.goto(lessonUrl(SINGLE_CHOICE));

    await option(page, 'a').click();
    await page.getByTestId('single-choice-submit').click();
    await page.getByTestId('feedback-footer-continue').click();
    await expect.poll(() => shownActivity(page)).not.toBe(SINGLE_CHOICE.id);

    await page.getByTestId('lesson-prev').click();
    await expect.poll(() => shownActivity(page)).toBe(SINGLE_CHOICE.id);
    // One action row: the exercise keeps no locked button above "Continuar".
    await expect(page.getByTestId('single-choice-submit')).toHaveCount(0);
    await page.getByTestId('lesson-redo').click();

    await expect(option(page, 'b')).toBeEnabled();
    await option(page, 'b').click();
    await page.getByTestId('single-choice-submit').click();
    await expect(page.getByTestId('feedback-footer')).toHaveAttribute('data-correct', 'false');
    await page.getByTestId('feedback-footer-continue').click();
    await expect.poll(() => shownActivity(page)).not.toBe(SINGLE_CHOICE.id);

    // The pass stands: back on it, the first answer is the one on screen.
    await page.getByTestId('lesson-prev').click();
    await expect(option(page, 'a')).toHaveAttribute('data-state', 'correct');
    await expect(page.getByTestId('lesson-redo')).toBeVisible();
    expect(writes.passed).toEqual([true]);
  });
});

test.describe('a code exercise out of lives', () => {
  const CODE = CODE_WITH_FAILING_CHECKS;

  test('a reload at zero lives leaves a way on, and the retry returns the lives', async ({ page }) => {
    await installLessonSubstrate(page, CODE);
    const writes = countAttemptWrites(page);
    await page.goto(lessonUrl(CODE));
    await expect(page.getByTestId('code-submit')).toBeEnabled({ timeout: 20_000 });

    // The fifth life spent, and the tab reloaded before the exercise's own Continue.
    await page.evaluate((activityId) => {
      const scope = localStorage.getItem('itera.scope.user');
      localStorage.setItem(
        `itera.code.attempts:${scope}:${activityId}`,
        JSON.stringify({ spent: '5', savedAt: new Date().toISOString(), execution: null }),
      );
    }, CODE.id);
    await page.reload();

    // Pre-fix: a disabled submit and nothing else, for good.
    await expect(page.getByTestId('lesson-retry-missed')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('concept-continue')).toBeVisible();
    await expect.poll(() => writes.passed).toEqual([false]);

    await page.getByTestId('lesson-retry-missed').click();
    await expect(page.getByTestId('lesson-retry-missed')).toHaveCount(0);
    await expect(page.locator('[data-out-of-lives]').first()).toHaveAttribute('data-out-of-lives', 'false');
    await expect(page.getByTestId('code-submit')).toBeEnabled();
    expect(writes.passed).toEqual([false]);
  });
});

test.describe('a written reflection', () => {
  const WRITTEN = 'Merge junta duas linhas de trabalho em uma só, e o Git pede ajuda quando elas brigam.';
  const input = (page: Page) => page.getByTestId('document-reflection-input');

  async function backOnTheReflection(page: Page) {
    await expect(page.getByTestId('lesson-activity')).toBeVisible();
    // Moving on waits for the write: poll, the first call lands before it.
    await expect.poll(() => shownActivity(page)).not.toBe(DOCUMENT_REFLECTION.id);
    await page.getByTestId('lesson-prev').click();
    await expect.poll(() => shownActivity(page)).toBe(DOCUMENT_REFLECTION.id);
    await expect(input(page)).toHaveValue(WRITTEN);
    await expect(input(page)).not.toBeEditable();
  }

  test('is still on screen on the step back, after a reload and on another device', async ({ page }) => {
    await installLessonSubstrate(page, DOCUMENT_REFLECTION);
    const writes = countAttemptWrites(page);
    await page.goto(lessonUrl(DOCUMENT_REFLECTION));

    await input(page).fill(WRITTEN);
    await page.getByTestId('activity-done').click();
    await expect.poll(() => writes.passed).toEqual([true]);
    await backOnTheReflection(page);

    await page.reload();
    await backOnTheReflection(page);

    await forgetLocalAnswers(page);
    await page.reload();
    await backOnTheReflection(page);
    expect(writes.passed).toEqual([true]);
  });

  test('half written and not yet sent, it is back after a reload right after the last key', async ({ page }) => {
    await installLessonSubstrate(page, DOCUMENT_REFLECTION);
    const writes = countAttemptWrites(page);
    await page.goto(lessonUrl(DOCUMENT_REFLECTION));

    await input(page).fill('Merge junta duas linhas');
    await page.reload();

    await expect.poll(() => shownActivity(page)).toBe(DOCUMENT_REFLECTION.id);
    await expect(input(page)).toHaveValue('Merge junta duas linhas');
    await expect(input(page)).toBeEditable();
    expect(writes.passed).toEqual([]);
  });
});

/**
 * One row per kind that redraws a prior answer: how to miss it, and what on
 * screen proves the miss came back the way the learner left it.
 */
const byOptionId = (page: Page, testId: string, id: string) =>
  page.locator(`[data-testid="${testId}"][data-option-id="${id}"]`);

const RESTORING_KINDS: Array<{
  fixture: ActivityFixture;
  miss: (page: Page) => Promise<void>;
  /** The control that must be locked while the miss stands, and free after the retry. */
  control: (page: Page) => ReturnType<Page['locator']>;
  drawn: (page: Page) => Promise<void>;
}> = [
  {
    fixture: MULTI_CHOICE,
    miss: async (page) => {
      await byOptionId(page, 'multi-choice-option', 'a').click();
      await page.getByTestId('multi-choice-submit').click();
    },
    control: (page) => byOptionId(page, 'multi-choice-option', 'a'),
    drawn: async (page) => {
      await expect(byOptionId(page, 'multi-choice-option', 'a')).toHaveAttribute('data-selected', 'true');
      await expect(byOptionId(page, 'multi-choice-option', 'b')).not.toHaveAttribute('data-selected', 'true');
    },
  },
  {
    fixture: MATCH,
    miss: async (page) => {
      await byOptionId(page, 'match-left-card', 'p1').click();
      await byOptionId(page, 'match-right-card', 'r2').click();
      await byOptionId(page, 'match-left-card', 'p2').click();
      await byOptionId(page, 'match-right-card', 'r1').click();
      await page.getByTestId('match-submit').click();
    },
    control: (page) => byOptionId(page, 'match-left-card', 'p1'),
    drawn: async (page) => {
      // Both crossed pairs are drawn again, and graded as the misses they were.
      for (const left of ['p1', 'p2']) {
        await expect(byOptionId(page, 'match-left-card', left)).toHaveAttribute('data-connected', 'true');
        await expect(byOptionId(page, 'match-left-card', left)).toHaveAttribute('data-verdict', 'miss');
      }
    },
  },
  {
    fixture: ORDER,
    miss: async (page) => {
      await dragOrderRow(page, 0, 1);
      await page.getByTestId('order-submit').click();
    },
    control: (page) => page.getByTestId('order-item').nth(0).getByTestId('order-grip'),
    drawn: async () => {},
  },
];

/** The order grip is a drag handle, not a form control: its lock is an attribute. */
async function expectLocked(control: ReturnType<Page['locator']>, kind: string, locked: boolean): Promise<void> {
  if (kind === 'order') await expect(control).toHaveAttribute('data-locked', String(locked));
  else if (locked) await expect(control).toBeDisabled();
  else await expect(control).toBeEnabled();
}

test.describe('every kind that redraws an answer re-opens a miss as the learner left it', () => {
  for (const { fixture, miss, control, drawn } of RESTORING_KINDS) {
    test(`${fixture.kind}: locked on the answer after a reload, free again after the retry`, async ({ page }) => {
      await installLessonSubstrate(page, fixture);
      const writes = countAttemptWrites(page);
      await page.goto(lessonUrl(fixture));
      await expect(page.getByTestId('lesson-activity')).toBeVisible();

      const before = fixture.kind === 'order' ? await orderOf(page) : null;
      await miss(page);
      await expect(page.getByTestId('feedback-footer')).toBeVisible();
      const submitted = fixture.kind === 'order' ? await orderOf(page) : null;
      // The arrangement the learner sent is one they made, not the one dealt.
      if (submitted) expect(submitted).not.toEqual(before);
      await expect.poll(() => answerSaved(page, fixture.id)).toBe(true);

      await page.reload();
      await expect(page.getByTestId('lesson-activity')).toBeVisible();
      expect(await shownActivity(page)).not.toBe(fixture.id);
      await page.getByTestId('lesson-prev').click();
      await expect.poll(() => shownActivity(page)).toBe(fixture.id);

      await expect(page.getByTestId('lesson-retry-missed')).toBeVisible();
      await expectLocked(control(page), fixture.kind, true);
      await drawn(page);
      if (submitted) expect(await orderOf(page)).toEqual(submitted);
      expect(writes.passed).toEqual([false]);

      await page.getByTestId('lesson-retry-missed').click();
      await expect(page.getByTestId('lesson-retry-missed')).toHaveCount(0);
      await expectLocked(control(page), fixture.kind, false);
    });
  }
});

test.describe('a finished terminal exercise', () => {
  test('re-opens settled after a reload: recap up, no first-step header, no prompt to type in', async ({ page }) => {
    await installLessonSubstrate(page, TERMINAL_FREE_TEXT);
    const writes = countAttemptWrites(page);
    await page.goto(lessonUrl(TERMINAL_FREE_TEXT));

    const prompt = page.getByTestId('terminal-input');
    await prompt.fill('git checkout -b feat/perfil');
    await prompt.press('Enter');
    await expect(page.getByTestId('sandbox-instruction')).toHaveAttribute('data-step-idx', '1');
    await prompt.fill('git status');
    await prompt.press('Enter');
    await expect(page.getByTestId('feedback-footer')).toBeVisible();
    await expect.poll(() => writes.passed).toEqual([true]);
    await expect.poll(() => answerSaved(page, TERMINAL_FREE_TEXT.id)).toBe(true);

    await page.reload();
    await expect(page.getByTestId('lesson-activity')).toBeVisible();
    expect(await shownActivity(page)).not.toBe(TERMINAL_FREE_TEXT.id);
    await page.getByTestId('lesson-prev').click();
    await expect.poll(() => shownActivity(page)).toBe(TERMINAL_FREE_TEXT.id);

    await expect(page.getByTestId('sandbox-reveal')).toBeVisible();
    await expect(page.getByTestId('sandbox-instruction')).toHaveCount(0);
    await expect(page.getByTestId('terminal-input')).toHaveCount(0);
    await expect(page.getByTestId('concept-continue')).toBeVisible();
    expect(writes.passed).toEqual([true]);
  });
});

/** The ids of the `order` items, top to bottom. */
function orderOf(page: Page): Promise<(string | null)[]> {
  return page.getByTestId('order-item').evaluateAll((els) => els.map((el) => el.getAttribute('data-option-id')));
}
