import { describe, it, expect } from 'vitest';
import { isAnswerableLiveKind, hasRevealableAnswer } from './isAnswerableLiveKind';

const ANSWERABLE = [
  'single_choice',
  'multi_choice',
  'match',
  'order',
  'quiz',
  'code',
  'sandbox_scenario',
];
const CONTENT = ['concept', 'video', 'document', 'diagram'];

describe('isAnswerableLiveKind', () => {
  it.each(ANSWERABLE)('true for answerable kind %s', (kind) => {
    expect(isAnswerableLiveKind(kind)).toBe(true);
  });

  it.each(CONTENT)('false for content kind %s', (kind) => {
    expect(isAnswerableLiveKind(kind)).toBe(false);
  });

  it('false for empty / null / unknown', () => {
    expect(isAnswerableLiveKind('')).toBe(false);
    expect(isAnswerableLiveKind(null)).toBe(false);
    expect(isAnswerableLiveKind(undefined)).toBe(false);
    expect(isAnswerableLiveKind('mystery')).toBe(false);
  });
});

describe('hasRevealableAnswer', () => {
  it.each(['single_choice', 'multi_choice', 'match', 'order', 'quiz', 'sandbox_scenario'])(
    'true for %s — these kinds have a correct answer we can put on screen',
    (kind) => {
      expect(hasRevealableAnswer(kind)).toBe(true);
    }
  );

  it('false for code — the spec carries no solution, so there is nothing to reveal', () => {
    expect(hasRevealableAnswer('code')).toBe(false);
  });

  it.each(CONTENT)('false for content kind %s', (kind) => {
    expect(hasRevealableAnswer(kind)).toBe(false);
  });

  it('false for empty / null / unknown', () => {
    expect(hasRevealableAnswer('')).toBe(false);
    expect(hasRevealableAnswer(null)).toBe(false);
    expect(hasRevealableAnswer(undefined)).toBe(false);
    expect(hasRevealableAnswer('mystery')).toBe(false);
  });
});

describe('the two predicates answer DIFFERENT questions', () => {
  it('revealable is a strict subset of answerable (never the other way round)', () => {
    for (const kind of ANSWERABLE.concat(CONTENT, ['mystery'])) {
      if (hasRevealableAnswer(kind)) expect(isAnswerableLiveKind(kind)).toBe(true);
    }
  });

  it('code is the kind where they diverge: timed, but nothing to reveal', () => {
    expect(isAnswerableLiveKind('code')).toBe(true);
    expect(hasRevealableAnswer('code')).toBe(false);
  });
});
