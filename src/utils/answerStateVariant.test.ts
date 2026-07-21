import { describe, it, expect } from 'vitest';
import { answerStateVariant } from './answerStateVariant';

describe('answerStateVariant', () => {
  it('maps missing/pending states to pending', () => {
    expect(answerStateVariant(undefined, true)).toBe('pending');
    expect(answerStateVariant('pending', false)).toBe('pending');
  });

  it('hides correctness from learners — any answer is just "answered"', () => {
    expect(answerStateVariant('done', false)).toBe('answered');
    expect(answerStateVariant('wrong', false)).toBe('answered');
  });

  it('keeps full correctness for the instructor', () => {
    expect(answerStateVariant('done', true)).toBe('done');
    expect(answerStateVariant('wrong', true)).toBe('wrong');
  });
});
