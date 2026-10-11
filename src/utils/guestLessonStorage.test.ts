import { beforeEach, describe, expect, it } from 'vitest';
import { GUEST_ANSWERS_KEY } from '@/consts/guestLesson';
import { clearGuestAnswers, forgetGuestAnswer, guestPassesToClaim, readGuestAnswers, writeGuestAnswer } from './guestLessonStorage';

beforeEach(() => localStorage.clear());

describe('guestLessonStorage', () => {
  it('keeps a settled answer and reads it back', () => {
    writeGuestAnswer('a', { correct: true, settledAt: 10, response: 'x', serverVerdict: 'pass' });
    expect(readGuestAnswers()).toEqual({ a: { correct: true, settledAt: 10, response: 'x', serverVerdict: 'pass' } });
  });

  it('forgets one answer and clears all', () => {
    writeGuestAnswer('a', { correct: false, settledAt: 1 });
    writeGuestAnswer('b', { correct: true, settledAt: 2 });
    expect(Object.keys(forgetGuestAnswer('a'))).toEqual(['b']);
    clearGuestAnswers();
    expect(localStorage.getItem(GUEST_ANSWERS_KEY)).toBeNull();
    expect(readGuestAnswers()).toEqual({});
  });

  it('ignores garbage in the key', () => {
    localStorage.setItem(GUEST_ANSWERS_KEY, '{"a":{"correct":"yes"},"b":5,"c":{"correct":true,"settledAt":3}}');
    expect(readGuestAnswers()).toEqual({ c: { correct: true, settledAt: 3 } });
    localStorage.setItem(GUEST_ANSWERS_KEY, 'not json');
    expect(readGuestAnswers()).toEqual({});
  });

  it('lists only the passes, oldest first, for the claim', () => {
    writeGuestAnswer('late', { correct: true, settledAt: 30 });
    writeGuestAnswer('miss', { correct: false, settledAt: 20 });
    writeGuestAnswer('early', { correct: true, settledAt: 10 });
    expect(guestPassesToClaim(readGuestAnswers()).map((p) => p.activityId)).toEqual(['early', 'late']);
  });

  it('caps a long response', () => {
    writeGuestAnswer('a', { correct: true, settledAt: 1, response: 'x'.repeat(5000) });
    expect(readGuestAnswers().a.response).toHaveLength(2000);
  });
});
