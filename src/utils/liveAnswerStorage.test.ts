import { describe, it, expect, beforeEach } from 'vitest';
import { readStoredAnswer, storeAnswer } from './liveAnswerStorage';

describe('liveAnswerStorage', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when nothing is stored', () => {
    expect(readStoredAnswer('s1', 'a1')).toBeNull();
  });

  it('round-trips an answer per session + activity', () => {
    storeAnswer('s1', 'a1', { correct: true, elapsedMs: 7000 });
    expect(readStoredAnswer('s1', 'a1')).toEqual({ correct: true, elapsedMs: 7000 });
    expect(readStoredAnswer('s1', 'a2')).toBeNull();
    expect(readStoredAnswer('s2', 'a1')).toBeNull();
  });

  it('keeps multiple activities under the same session', () => {
    storeAnswer('s1', 'a1', { correct: true, elapsedMs: 1000 });
    storeAnswer('s1', 'a2', { correct: false, elapsedMs: 2000 });
    expect(readStoredAnswer('s1', 'a1')?.correct).toBe(true);
    expect(readStoredAnswer('s1', 'a2')?.correct).toBe(false);
  });

  it('survives corrupted storage payloads', () => {
    localStorage.setItem('itera.live.answers:s1', '{not json');
    expect(readStoredAnswer('s1', 'a1')).toBeNull();
    storeAnswer('s1', 'a1', { correct: true, elapsedMs: 1 });
    expect(readStoredAnswer('s1', 'a1')?.elapsedMs).toBe(1);
  });
});
