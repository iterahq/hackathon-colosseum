import { describe, it, expect, beforeEach } from 'vitest';
import { readStoredAnswer, storeAnswer, clearStoredAnswer } from './liveAnswerStorage';

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

  it('clears one activity (professor reset) without touching the others', () => {
    storeAnswer('s1', 'a1', { correct: false, elapsedMs: 1000 });
    storeAnswer('s1', 'a2', { correct: true, elapsedMs: 2000 });
    clearStoredAnswer('s1', 'a1');
    expect(readStoredAnswer('s1', 'a1')).toBeNull();
    expect(readStoredAnswer('s1', 'a2')?.correct).toBe(true);
    // Clearing something that was never stored is a harmless no-op.
    expect(() => clearStoredAnswer('s1', 'missing')).not.toThrow();
  });

  it('survives corrupted storage payloads', () => {
    localStorage.setItem('itera.live.answers:s1', '{not json');
    expect(readStoredAnswer('s1', 'a1')).toBeNull();
    storeAnswer('s1', 'a1', { correct: true, elapsedMs: 1 });
    expect(readStoredAnswer('s1', 'a1')?.elapsedMs).toBe(1);
  });
});
