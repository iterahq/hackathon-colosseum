import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '@/types/content';
import { readGuestAnswers, writeGuestAnswer } from '@/utils/guestLessonStorage';
import { useGuestLesson } from './useGuestLesson';

const grade = vi.hoisted(() => ({ submitForGrading: vi.fn(async () => ({ verdict: 'pass', mode: 'server' })) }));
vi.mock('@/services/grade.service', () => grade);
vi.mock('@/hooks/useLessonSound', () => ({
  useLessonSound: () => ({ muted: false, toggleMuted: vi.fn(), onSettle: vi.fn(), onAdvance: vi.fn(), onRetry: vi.fn(), onFinish: vi.fn() }),
}));

const activity = (id: string, kind: string): Activity => ({ id, lesson_id: 'l', ordinal: 0, kind, spec: {}, status: 'todo' }) as unknown as Activity;
const lesson = [activity('c1', 'concept'), activity('q1', 'single_choice'), activity('x1', 'xray')];

beforeEach(() => {
  localStorage.clear();
  grade.submitForGrading.mockClear();
});

describe('useGuestLesson', () => {
  it('starts on the first unanswered activity and advances a reading kind at once', () => {
    writeGuestAnswer('c1', { correct: true, settledAt: 1 });
    const { result } = renderHook(() => useGuestLesson(lesson));
    expect(result.current.current?.id).toBe('q1');
    expect(grade.submitForGrading).not.toHaveBeenCalled();
  });

  it('holds a graded kind on the footer, asks the server without writing, and keeps the verdict beside the answer', async () => {
    const { result } = renderHook(() => useGuestLesson(lesson));
    act(() => result.current.handleComplete(true));
    expect(result.current.current?.id).toBe('q1');
    await act(async () => result.current.handleComplete(true, { response: 'b' }));
    expect(result.current.pending).toEqual({ correct: true, message: undefined, explanation: undefined });
    expect(grade.submitForGrading).toHaveBeenCalledWith({ activityId: 'q1', passed: true, response: 'b', actions: undefined });
    expect(readGuestAnswers().q1).toMatchObject({ correct: true, response: 'b', serverVerdict: 'pass' });
    expect(readGuestAnswers().c1).toMatchObject({ correct: true });
    act(() => result.current.advance());
    expect(result.current.current?.id).toBe('x1');
  });

  it('reopens a miss on retry and finishes with the counts the end card needs', async () => {
    const { result } = renderHook(() => useGuestLesson(lesson));
    act(() => result.current.handleComplete(true));
    await act(async () => result.current.handleComplete(false, { response: 'a' }));
    expect(result.current.pending?.correct).toBe(false);
    act(() => result.current.retryPending());
    expect(result.current.pending).toBeNull();
    expect(readGuestAnswers().q1).toBeUndefined();
    expect(result.current.retryCount).toBe(1);
    await act(async () => result.current.handleComplete(true, { response: 'b' }));
    act(() => result.current.advance());
    await act(async () => result.current.handleComplete(true));
    act(() => result.current.advance());
    expect(result.current.finished).toBe(true);
    expect(result.current.counts).toEqual({ passed: 3, serverChecked: 1 });
    expect(result.current.progressPct).toBe(100);
  });

  it('records a verdict the kind settles itself without a second grade on continue, and hides the answer until a retry', async () => {
    const { result } = renderHook(() => useGuestLesson(lesson));
    act(() => result.current.handleComplete(true));
    expect(result.current.hidesAnswer).toBe(true);
    await act(async () => result.current.handleVerdict(false, { response: 'a' }));
    expect(grade.submitForGrading).toHaveBeenCalledTimes(1);
    await act(async () => result.current.handleComplete(false, { response: 'a' }));
    expect(grade.submitForGrading).toHaveBeenCalledTimes(1);
    expect(result.current.pending?.correct).toBe(false);
    act(() => result.current.retryPending());
    expect(result.current.hidesAnswer).toBe(false);
  });

  it('redoMissed goes back to the first activity not passed', () => {
    writeGuestAnswer('c1', { correct: true, settledAt: 1 });
    writeGuestAnswer('q1', { correct: false, settledAt: 2 });
    writeGuestAnswer('x1', { correct: true, settledAt: 3 });
    const { result } = renderHook(() => useGuestLesson(lesson));
    expect(result.current.finished).toBe(true);
    act(() => result.current.redoMissed());
    expect(result.current.finished).toBe(false);
    expect(result.current.current?.id).toBe('q1');
    expect(readGuestAnswers().q1).toBeUndefined();
  });
});
