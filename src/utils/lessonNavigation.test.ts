import { describe, it, expect } from 'vitest';
import { canStepBack, canStepForward, jumpToFrontier, stepBack, stepForward } from './lessonNavigation';

describe('stepBack', () => {
  it('lands on the last activity when leaving the completion screen', () => {
    expect(stepBack({ index: 0, completed: true }, 5)).toEqual({ index: 4, completed: false });
  });

  it('walks one activity back', () => {
    expect(stepBack({ index: 3, completed: false }, 5)).toEqual({ index: 2, completed: false });
  });

  it('is a no-op on the first activity', () => {
    expect(stepBack({ index: 0, completed: false }, 5)).toEqual({ index: 0, completed: false });
  });

  it('never returns a negative index for an empty lesson', () => {
    expect(stepBack({ index: 0, completed: true }, 0)).toEqual({ index: 0, completed: false });
  });
});

describe('stepForward', () => {
  it('walks one activity forward', () => {
    expect(stepForward({ index: 1, completed: false }, 5)).toEqual({ index: 2, completed: false });
  });

  it('reaches the completion screen from the last activity', () => {
    expect(stepForward({ index: 4, completed: false }, 5)).toEqual({ index: 4, completed: true });
  });
});

describe('canStepBack', () => {
  it('is false on the first activity', () => {
    expect(canStepBack({ index: 0, completed: false }, 5)).toBe(false);
  });

  it('is true anywhere after the first activity', () => {
    expect(canStepBack({ index: 1, completed: false }, 5)).toBe(true);
  });

  it('is true on the completion screen', () => {
    expect(canStepBack({ index: 0, completed: true }, 5)).toBe(true);
  });

  it('is false for an empty lesson', () => {
    expect(canStepBack({ index: 0, completed: true }, 0)).toBe(false);
  });
});

describe('canStepForward', () => {
  it('is true while behind the frontier', () => {
    expect(canStepForward({ index: 1, completed: false }, 3)).toBe(true);
  });

  it('is false at the frontier', () => {
    expect(canStepForward({ index: 3, completed: false }, 3)).toBe(false);
  });

  it('is true at the frontier once the learner has finished the lesson', () => {
    expect(canStepForward({ index: 3, completed: false }, 3, true)).toBe(true);
  });

  it('is false on the completion screen even when finished', () => {
    expect(canStepForward({ index: 3, completed: true }, 3, true)).toBe(false);
  });

  it('is false on the completion screen', () => {
    expect(canStepForward({ index: 0, completed: true }, 3)).toBe(false);
  });
});

describe('jumpToFrontier', () => {
  it('lands on the frontier activity, not the completion screen', () => {
    expect(jumpToFrontier(2)).toEqual({ index: 2, completed: false });
  });
});
