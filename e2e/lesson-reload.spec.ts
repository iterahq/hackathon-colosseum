import { test, expect, type Page } from '@playwright/test';
import { SINGLE_CHOICE } from './support/activityFixtures';
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
