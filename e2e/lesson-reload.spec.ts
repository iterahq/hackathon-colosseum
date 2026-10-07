import { test, expect, type Page } from '@playwright/test';
import { CODE_WITH_FAILING_CHECKS, SINGLE_CHOICE } from './support/activityFixtures';
import { STUB_SUPABASE_URL } from './support/harnessStub';
import { installLessonSubstrate, lessonUrl } from './support/lessonStub';

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
