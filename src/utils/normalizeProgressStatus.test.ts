import { describe, it, expect } from 'vitest';
import { normalizeProgressStatus } from './normalizeProgressStatus';

/**
 * Regression guard for the lesson-completion enum mismatch.
 *
 * The DB enum is ('not_started','in_progress','completed'); the UI is
 * ('todo','in_progress','done'). Reading the raw DB 'completed' into the UI made
 * `status === 'done'` false everywhere, so a completed lesson stayed not-done and
 * the next lesson stayed LOCKED. This util is the single translation point.
 */
describe('normalizeProgressStatus', () => {
  it("maps DB 'completed' to UI 'done' (the unlock-gate value)", () => {
    expect(normalizeProgressStatus('completed')).toBe('done');
  });

  it("passes 'in_progress' through", () => {
    expect(normalizeProgressStatus('in_progress')).toBe('in_progress');
  });

  it("maps DB 'not_started' to UI 'todo'", () => {
    expect(normalizeProgressStatus('not_started')).toBe('todo');
  });

  it("treats already-canonical 'done' as 'done' (idempotent)", () => {
    expect(normalizeProgressStatus('done')).toBe('done');
  });

  it('defaults unknown / null / undefined to todo', () => {
    expect(normalizeProgressStatus(null)).toBe('todo');
    expect(normalizeProgressStatus(undefined)).toBe('todo');
    expect(normalizeProgressStatus('garbage')).toBe('todo');
  });

  it("never returns the raw DB value 'completed'", () => {
    expect(normalizeProgressStatus('completed')).not.toBe('completed');
  });
});
