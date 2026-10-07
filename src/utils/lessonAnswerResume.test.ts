import { describe, it, expect } from 'vitest';
import {
  answersFromLog,
  furthestReached,
  needsReplay,
  reconcileAnswers,
  LANDED_ATTEMPT_SLACK_MS,
  NEWER_ATTEMPT_SLACK_MS,
} from './lessonAnswerResume';
import type { LatestAttempts } from '@/services/progress.service';
import type { StoredLessonAnswer } from '@/types/lessonAnswer';

const T = 1_700_000_000_000;
const miss = (settledAt = T, response = 'wrong'): LatestAttempts => ({
  latest: { passed: false, settledAt, response },
});
const pass = (settledAt = T): LatestAttempts => ({
  latest: { passed: true, settledAt, response: 'right' },
  latestPass: { passed: true, settledAt, response: 'right' },
});
const localAnswer = (over: Partial<StoredLessonAnswer> = {}): StoredLessonAnswer => ({
  correct: false,
  settledAt: T,
  saved: true,
  ...over,
});

describe('answersFromLog', () => {
  it('reads a miss off an activity that is not completed', () => {
    expect(answersFromLog(['a'], { a: 'in_progress' }, { a: miss() })).toEqual({
      a: { correct: false, settledAt: T, saved: true, response: 'wrong' },
    });
  });

  it('reads the newest PASS off a completed activity, even under a later miss', () => {
    const attempts: LatestAttempts = {
      latest: { passed: false, settledAt: T + 5000 },
      latestPass: { passed: true, settledAt: T, response: 'right' },
    };
    expect(answersFromLog(['a'], { a: 'completed' }, { a: attempts }).a).toMatchObject({
      correct: true,
      response: 'right',
    });
  });

  it('treats a passed attempt on a non-completed activity as a lesson reset', () => {
    expect(answersFromLog(['a'], { a: 'in_progress' }, { a: pass() })).toEqual({});
  });

  it('says nothing about an activity with no attempts', () => {
    expect(answersFromLog(['a', 'b'], { a: 'completed' }, {})).toEqual({});
  });
});

describe('reconcileAnswers', () => {
  it('takes the log when this device has nothing', () => {
    const { answers, fromLog } = reconcileAnswers(['a'], {}, { a: 'in_progress' }, { a: miss() });
    expect(answers.a?.correct).toBe(false);
    expect(fromLog).toEqual(['a']);
  });

  it('keeps the local answer, which carries the actions, for the same attempt', () => {
    const mine = localAnswer({ actions: [{ type: 'answer_submitted', at: T }] as never });
    const { answers, fromLog } = reconcileAnswers(['a'], { a: mine }, { a: 'in_progress' }, { a: miss(T + 900) });
    expect(answers.a).toBe(mine);
    expect(fromLog).toEqual([]);
  });

  it('lets a clearly later attempt from another device win', () => {
    const later = T + NEWER_ATTEMPT_SLACK_MS + 1;
    const { answers, fromLog } = reconcileAnswers(['a'], { a: localAnswer() }, { a: 'completed' }, { a: pass(later) });
    expect(answers.a).toMatchObject({ correct: true, settledAt: later });
    expect(fromLog).toEqual(['a']);
  });

  it('keeps this device’s picks when the same answer only landed late', () => {
    const picks = [{ type: 'answer_submitted', at: T }] as never;
    const later = T + NEWER_ATTEMPT_SLACK_MS + 1;
    const { answers } = reconcileAnswers(['a'], { a: localAnswer({ actions: picks }) }, { a: 'in_progress' }, { a: miss(later) });
    expect(answers.a).toMatchObject({ correct: false, settledAt: later, actions: picks });
    const flipped = reconcileAnswers(['a'], { a: localAnswer({ actions: picks }) }, { a: 'completed' }, { a: pass(later) });
    expect(flipped.answers.a?.actions).toBeUndefined();
  });

  it('drops a saved local pass the server re-opened, so the exercise is not locked forever', () => {
    const mine = localAnswer({ correct: true });
    expect(reconcileAnswers(['a'], { a: mine }, { a: 'in_progress' }, { a: pass() }).answers).toEqual({});
    expect(reconcileAnswers(['a'], { a: mine }, {}, {}).answers).toEqual({});
  });

  it('keeps a local pass whose write has not landed yet', () => {
    const mine = localAnswer({ correct: true, saved: false });
    expect(reconcileAnswers(['a'], { a: mine }, {}, {}).answers.a).toBe(mine);
  });

  it('keeps a local miss the log has not received yet', () => {
    const mine = localAnswer();
    expect(reconcileAnswers(['a'], { a: mine }, {}, {}).answers.a).toBe(mine);
  });

  it('ignores answers for activities outside the lesson', () => {
    expect(reconcileAnswers(['a'], { z: localAnswer() }, {}, { z: miss() }).answers).toEqual({});
  });
});

describe('needsReplay', () => {
  const unsaved = localAnswer({ saved: false });

  it('sends an unconfirmed answer the log has never seen', () => {
    expect(needsReplay(unsaved, undefined, undefined)).toBe(true);
    expect(needsReplay(unsaved, 'in_progress', miss(T - 60_000))).toBe(true);
  });

  it('does not send again an answer whose row landed before the tab closed', () => {
    expect(needsReplay(unsaved, 'in_progress', miss(T + 300))).toBe(false);
    expect(needsReplay(unsaved, 'in_progress', miss(T - LANDED_ATTEMPT_SLACK_MS))).toBe(false);
  });

  it('does not take an earlier miss in the log for a pass that never landed', () => {
    const pending = localAnswer({ correct: true, saved: false });
    expect(needsReplay(pending, 'in_progress', miss(T + 10_000))).toBe(true);
    expect(needsReplay(pending, 'in_progress', pass(T + 300))).toBe(false);
  });

  it('never sends a confirmed answer, nor one for a completed activity', () => {
    expect(needsReplay(localAnswer(), undefined, undefined)).toBe(false);
    expect(needsReplay(unsaved, 'completed', undefined)).toBe(false);
  });
});

describe('furthestReached', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];

  it('is where the lesson resumes when nothing later was answered', () => {
    expect(furthestReached(ids, 2, new Set(['a', 'b']))).toBe(2);
    expect(furthestReached(ids, 0, new Set())).toBe(0);
  });

  it('stays past the last answered activity when a retry re-opened an earlier one', () => {
    expect(furthestReached(ids, 1, new Set(['a', 'c', 'd']))).toBe(4);
  });

  it('never points past the last activity', () => {
    expect(furthestReached(ids, 5, new Set(ids))).toBe(4);
  });
});
