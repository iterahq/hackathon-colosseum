import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLessonAnswers } from './useLessonAnswers';
import { readLessonAnswers, storeLessonAnswer } from '@/utils/lessonAnswerStorage';
import { readCodeAttempts, saveCodeAttempts } from '@/services/codeAttempts.service';
import { rememberStorageScope } from '@/utils/storageScope';

const miss = { correct: false, settledAt: 1000, saved: false };

describe('useLessonAnswers — state and storage move together', () => {
  beforeEach(() => {
    localStorage.clear();
    rememberStorageScope('learner-a');
  });

  it('records an answer on screen and on disk', () => {
    const { result } = renderHook(() => useLessonAnswers());
    act(() => result.current.record('a1', miss));
    expect(result.current.answers.a1).toEqual(miss);
    expect(readLessonAnswers().a1?.correct).toBe(false);
  });

  it('a retry forgets the miss in both places, returns the code lives and re-keys the activity', () => {
    saveCodeAttempts('a1', '5');
    const { result } = renderHook(() => useLessonAnswers());
    act(() => result.current.record('a1', miss));
    act(() => result.current.record('a2', miss));
    act(() => result.current.retry('a1'));
    expect(result.current.answers).toEqual({ a2: miss });
    expect(Object.keys(readLessonAnswers())).toEqual(['a2']);
    expect(readCodeAttempts('a1')).toBeNull();
    expect(result.current.retryCount).toBe(1);
  });

  it('loading a resumed lesson replaces the state without touching the disk', () => {
    storeLessonAnswer('kept', miss);
    const { result } = renderHook(() => useLessonAnswers());
    act(() => result.current.record('a1', miss));
    act(() => result.current.load({ a9: { ...miss, saved: true } }));
    expect(Object.keys(result.current.answers)).toEqual(['a9']);
    expect(Object.keys(readLessonAnswers()).sort()).toEqual(['a1', 'kept']);
  });

  it('keeps its callbacks stable, so effects depending on them do not re-run', () => {
    const { result, rerender } = renderHook(() => useLessonAnswers());
    const { load, record, retry } = result.current;
    rerender();
    expect(result.current.load).toBe(load);
    expect(result.current.record).toBe(record);
    expect(result.current.retry).toBe(retry);
  });
});
