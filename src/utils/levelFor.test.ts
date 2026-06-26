import { describe, it, expect } from 'vitest';
import { levelFor } from './levelFor';

/**
 * Guards the activity-count → difficulty proxy used by ProgramCard's footer tag.
 * Boundaries matter: 7 flips beginner→intermediate, 15 flips →advanced.
 */
describe('levelFor', () => {
  it('returns beginner below 7 activities', () => {
    expect(levelFor(0)).toBe('beginner');
    expect(levelFor(6)).toBe('beginner');
  });

  it('returns intermediate from 7 to 14 activities', () => {
    expect(levelFor(7)).toBe('intermediate');
    expect(levelFor(14)).toBe('intermediate');
  });

  it('returns advanced from 15 activities up', () => {
    expect(levelFor(15)).toBe('advanced');
    expect(levelFor(40)).toBe('advanced');
  });
});
