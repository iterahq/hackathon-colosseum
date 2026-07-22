import { describe, it, expect } from 'vitest';
import { isAnswerableLiveKind } from './isAnswerableLiveKind';

describe('isAnswerableLiveKind', () => {
  it.each(['single_choice', 'multi_choice', 'match', 'order', 'quiz', 'code', 'sandbox_scenario'])(
    'true for answerable kind %s',
    (kind) => {
      expect(isAnswerableLiveKind(kind)).toBe(true);
    }
  );

  it.each(['concept', 'video', 'document', 'diagram'])('false for content kind %s', (kind) => {
    expect(isAnswerableLiveKind(kind)).toBe(false);
  });

  it('false for empty / null / unknown', () => {
    expect(isAnswerableLiveKind('')).toBe(false);
    expect(isAnswerableLiveKind(null)).toBe(false);
    expect(isAnswerableLiveKind(undefined)).toBe(false);
    expect(isAnswerableLiveKind('mystery')).toBe(false);
  });
});
