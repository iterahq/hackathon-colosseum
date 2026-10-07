import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Activity } from '@/types/content';
import type { LatestAttempts, ProgressStatus } from '@/services/progress.service';

const progress = vi.fn<() => Promise<Record<string, ProgressStatus> | null>>();
const attempts = vi.fn<() => Promise<Record<string, LatestAttempts> | null>>();
const actions = vi.fn();
const writeOrQueue = vi.fn();

vi.mock('@/services/progress.service', async (orig) => ({
  ...(await orig<typeof import('@/services/progress.service')>()),
  fetchActivityProgressOrNull: () => progress(),
  fetchLatestAttempts: () => attempts(),
  fetchAnswerActions: (...args: unknown[]) => actions(...args),
}));
vi.mock('@/hooks/useAnswerOutbox', () => ({ writeOrQueue: (entry: unknown) => writeOrQueue(entry) }));

import { ANSWER_ACTIONS_TIMEOUT_MS, resumeLesson } from './lessonResume.service';
import { readLessonAnswers, storeLessonAnswer } from '@/utils/lessonAnswerStorage';
import { rememberStorageScope } from '@/utils/storageScope';

const T = 1_700_000_000_000;
const lesson = (...kinds: string[]): Activity[] =>
  kinds.map((kind, i) => ({ id: `a${i + 1}`, lessonId: 'l', ordinal: i + 1, kind, spec: {}, rubric: null }) as Activity);
const miss = (settledAt = T): LatestAttempts => ({ latest: { passed: false, settledAt, response: 'wrong' } });
const never = () => false;

beforeEach(() => {
  localStorage.clear();
  rememberStorageScope('learner-a');
  progress.mockReset().mockResolvedValue({});
  attempts.mockReset().mockResolvedValue({});
  actions.mockReset().mockResolvedValue([]);
  writeOrQueue.mockReset().mockResolvedValue(true);
});
afterEach(() => vi.useRealTimers());

describe('resumeLesson — where the lesson opens', () => {
  it('opens a lesson nobody touched at the top', async () => {
    expect(await resumeLesson(lesson('concept', 'single_choice'), never)).toMatchObject({
      index: 0,
      furthest: 0,
      completed: false,
      finished: false,
      answers: {},
    });
  });

  it('opens past what is done or answered, on the first activity still unanswered', async () => {
    progress.mockResolvedValue({ a1: 'completed', a2: 'in_progress' });
    attempts.mockResolvedValue({ a2: miss() });
    const resume = await resumeLesson(lesson('concept', 'single_choice', 'single_choice'), never);
    expect(resume).toMatchObject({ index: 2, furthest: 2, completed: false, finished: false });
    expect([...resume!.doneIds]).toEqual(['a1']);
    expect(resume!.answers.a2?.correct).toBe(false);
  });

  it('opens a finished lesson with a miss left ON the miss, the end still reachable', async () => {
    progress.mockResolvedValue({ a1: 'completed', a2: 'in_progress', a3: 'completed' });
    attempts.mockResolvedValue({ a2: miss() });
    expect(await resumeLesson(lesson('concept', 'single_choice', 'concept'), never)).toMatchObject({
      index: 1,
      furthest: 2,
      completed: false,
      finished: true,
    });
  });

  it('opens a completed lesson on its completion screen', async () => {
    progress.mockResolvedValue({ a1: 'completed', a2: 'completed' });
    expect(await resumeLesson(lesson('concept', 'single_choice'), never)).toMatchObject({
      index: 1,
      completed: true,
      finished: true,
    });
  });
});

describe('resumeLesson — this device’s record against the server', () => {
  it('keeps the local record, untouched, when progress cannot be read', async () => {
    storeLessonAnswer('a1', { correct: true, settledAt: T, saved: true });
    progress.mockResolvedValue(null);
    attempts.mockResolvedValue({});
    const resume = await resumeLesson(lesson('single_choice', 'concept'), never);
    expect(resume!.answers.a1?.correct).toBe(true);
    expect(readLessonAnswers().a1).toBeDefined();
  });

  it('drops and forgets a saved local pass the server re-opened', async () => {
    storeLessonAnswer('a1', { correct: true, settledAt: T, saved: true });
    const resume = await resumeLesson(lesson('single_choice', 'concept'), never);
    expect(resume!.answers).toEqual({});
    expect(resume!.index).toBe(0);
    expect(readLessonAnswers()).toEqual({});
  });

  it('caches an answer read from the log, with its picked options, for the next load', async () => {
    progress.mockResolvedValue({ a1: 'in_progress' });
    attempts.mockResolvedValue({ a1: miss() });
    const picked = [{ type: 'answer_submitted', at: T, payload: { option_ids: ['b'] } }];
    actions.mockResolvedValue(picked);
    const resume = await resumeLesson(lesson('single_choice', 'concept'), never);
    expect(actions).toHaveBeenCalledWith('a1', T, false);
    expect(resume!.answers.a1?.actions).toEqual(picked);
    expect(readLessonAnswers().a1?.actions).toEqual(picked);
  });

  it('reads no trace for a kind that does not redraw an answer', async () => {
    progress.mockResolvedValue({ a1: 'in_progress' });
    attempts.mockResolvedValue({ a1: miss() });
    await resumeLesson(lesson('code_editor_checks', 'concept'), never);
    expect(actions).not.toHaveBeenCalled();
  });

  it('does not wait for a trace read that never answers', async () => {
    vi.useFakeTimers();
    progress.mockResolvedValue({ a1: 'in_progress' });
    attempts.mockResolvedValue({ a1: miss() });
    actions.mockReturnValue(new Promise(() => {}));
    const pending = resumeLesson(lesson('single_choice', 'concept'), never);
    await vi.advanceTimersByTimeAsync(ANSWER_ACTIONS_TIMEOUT_MS + 1);
    const resume = await pending;
    // Locked on the miss all the same; only the picked option is not drawn.
    expect(resume!.answers.a1).toMatchObject({ correct: false });
    expect(resume!.answers.a1?.actions).toBeUndefined();
    expect(resume!.index).toBe(1);
  });
});

describe('resumeLesson — an answer whose write was never confirmed', () => {
  it('sends it again, dated to when the learner answered, and confirms it once it lands', async () => {
    storeLessonAnswer('a1', { correct: false, settledAt: T, saved: false, response: 'wrong' });
    await resumeLesson(lesson('single_choice', 'concept'), never);
    expect(writeOrQueue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'progress', activityId: 'a1', passed: false, settledAt: T, response: 'wrong' })
    );
    await vi.waitFor(() => expect(readLessonAnswers().a1?.saved).toBe(true));
  });

  it('leaves a PASS unconfirmed while it only sits in the outbox', async () => {
    storeLessonAnswer('a1', { correct: true, settledAt: T, saved: false });
    writeOrQueue.mockResolvedValue(false);
    const resume = await resumeLesson(lesson('single_choice', 'concept'), never);
    await Promise.resolve();
    expect(readLessonAnswers().a1?.saved).toBe(false);
    // Still answered on this device: it is not asked again while the write is pending.
    expect(resume!.index).toBe(1);
  });

  it('does not send it when the log shows the row had landed', async () => {
    storeLessonAnswer('a1', { correct: false, settledAt: T, saved: false });
    progress.mockResolvedValue({ a1: 'in_progress' });
    attempts.mockResolvedValue({ a1: miss(T + 300) });
    await resumeLesson(lesson('single_choice', 'concept'), never);
    expect(writeOrQueue).not.toHaveBeenCalled();
    expect(readLessonAnswers().a1?.saved).toBe(true);
  });
});

describe('resumeLesson — the lesson changed while it was reading', () => {
  it('returns nothing and writes nothing once cancelled after the first read', async () => {
    storeLessonAnswer('a1', { correct: true, settledAt: T, saved: true });
    expect(await resumeLesson(lesson('single_choice', 'concept'), () => true)).toBeNull();
    expect(readLessonAnswers().a1).toBeDefined();
    expect(writeOrQueue).not.toHaveBeenCalled();
  });

  it('writes nothing when cancelled while the traces were being read', async () => {
    progress.mockResolvedValue({ a1: 'in_progress' });
    attempts.mockResolvedValue({ a1: miss() });
    let cancelled = false;
    actions.mockImplementation(async () => {
      cancelled = true;
      return [{ type: 'answer_submitted', at: T, payload: { option_ids: ['b'] } }];
    });
    expect(await resumeLesson(lesson('single_choice', 'concept'), () => cancelled)).toBeNull();
    expect(readLessonAnswers()).toEqual({});
  });
});
