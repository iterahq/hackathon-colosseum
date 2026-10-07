import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearLessonAnswers,
  confirmLessonAnswer,
  readLessonAnswers,
  restoreActions,
  storeLessonAnswer,
} from './lessonAnswerStorage';
import { rememberStorageScope } from './storageScope';

const miss = { correct: false, settledAt: 1000, saved: true };

describe('lessonAnswerStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    rememberStorageScope('learner-a');
  });

  it('returns nothing when nothing is stored', () => {
    expect(readLessonAnswers()).toEqual({});
  });

  it('round-trips a miss and a hit per activity', () => {
    storeLessonAnswer('a1', miss);
    storeLessonAnswer('a2', { correct: true, settledAt: 2000, saved: false, response: 'Paris' });
    const all = readLessonAnswers();
    expect(all.a1?.correct).toBe(false);
    expect(all.a2).toMatchObject({ correct: true, saved: false, response: 'Paris' });
  });

  it('never leaks one learner’s answers to another on the same browser', () => {
    storeLessonAnswer('a1', miss);
    rememberStorageScope('learner-b');
    expect(readLessonAnswers()).toEqual({});
  });

  it('writes nothing while the owner is unknown', () => {
    localStorage.clear();
    storeLessonAnswer('a1', miss);
    rememberStorageScope('learner-a');
    expect(readLessonAnswers()).toEqual({});
  });

  it('forgets only the activities it is asked to', () => {
    storeLessonAnswer('a1', miss);
    storeLessonAnswer('a2', miss);
    clearLessonAnswers(['a1']);
    expect(Object.keys(readLessonAnswers())).toEqual(['a2']);
  });

  it('survives a corrupted payload and drops malformed entries', () => {
    localStorage.setItem('itera.lesson.answers:learner-a:v1', '{not json');
    expect(readLessonAnswers()).toEqual({});
    localStorage.setItem(
      'itera.lesson.answers:learner-a:v1',
      JSON.stringify({ a1: { correct: 'yes' }, a2: miss })
    );
    expect(Object.keys(readLessonAnswers())).toEqual(['a2']);
  });

  it('keeps only the actions a restore reads, the last of each', () => {
    const actions = [
      { type: 'option_selected', at: 1, payload: { option_id: 'a' } },
      { type: 'answer_submitted', at: 2, payload: { option_ids: ['a'] } },
      { type: 'option_selected', at: 3, payload: { option_id: 'b' } },
      { type: 'answer_submitted', at: 4, payload: { option_ids: ['b'] } },
    ] as never;
    expect(restoreActions(actions)).toEqual([
      { type: 'answer_submitted', at: 4, payload: { option_ids: ['b'] } },
    ]);
    storeLessonAnswer('a1', { ...miss, actions });
    expect(readLessonAnswers().a1?.actions).toHaveLength(1);
  });

  it('confirms an answer only while it is still the stored one', () => {
    storeLessonAnswer('a1', { correct: false, settledAt: 1000, saved: false });
    confirmLessonAnswer('a1', 999);
    expect(readLessonAnswers().a1?.saved).toBe(false);
    confirmLessonAnswer('a1', 1000);
    expect(readLessonAnswers().a1?.saved).toBe(true);
    clearLessonAnswers(['a1']);
    confirmLessonAnswer('a1', 1000);
    expect(readLessonAnswers()).toEqual({});
  });

  it('caps a long free-text answer', () => {
    storeLessonAnswer('a1', { ...miss, response: 'x'.repeat(5000) });
    expect(readLessonAnswers().a1?.response).toHaveLength(2000);
  });
});
