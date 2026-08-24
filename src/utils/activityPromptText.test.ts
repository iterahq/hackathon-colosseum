import { describe, it, expect } from 'vitest';
import { activityPromptText } from './activityPromptText';
import type { Activity } from '@/types/content';

function activity(spec: unknown): Activity {
  return { id: 'a', lessonId: 'l', ordinal: 0, kind: 'code', spec, rubric: null, status: 'todo' } as Activity;
}

describe('activityPromptText', () => {
  it('reads the statement out of the spec', () => {
    expect(activityPromptText(activity({ prompt: 'Adicione o segundo card.' }))).toBe('Adicione o segundo card.');
  });

  it('trims surrounding whitespace', () => {
    expect(activityPromptText(activity({ prompt: '  faça isso\n' }))).toBe('faça isso');
  });

  it('returns empty for a kind that carries no prompt', () => {
    expect(activityPromptText(activity({ title: 'x' }))).toBe('');
  });

  it('survives a spec that is not an object', () => {
    expect(activityPromptText(activity(null))).toBe('');
    expect(activityPromptText(activity(['a']))).toBe('');
    expect(activityPromptText(activity({ prompt: 42 }))).toBe('');
  });

  it('survives a missing activity', () => {
    expect(activityPromptText(null)).toBe('');
    expect(activityPromptText(undefined)).toBe('');
  });
});
