import { describe, it, expect } from 'vitest';
import { activityLabel } from './activityLabel';

describe('activityLabel', () => {
  it('prefers a non-empty prompt', () => {
    expect(activityLabel({ prompt: ' O que é git? ', title: 'x' }, 'f')).toBe('O que é git?');
  });

  it('falls back to title when prompt is missing or blank', () => {
    expect(activityLabel({ prompt: '  ', title: 'Quiz 1' }, 'f')).toBe('Quiz 1');
  });

  it('uses the fallback for non-string fields', () => {
    expect(activityLabel({ prompt: 42, title: { pt: 'x' } }, 'Atividade 3')).toBe('Atividade 3');
  });
});
