import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { CodeSpec } from '@iterahq/activity-spec';
import { ActivityProvider } from '../../context.js';
import { createActivityI18n } from '../../i18n/dictionary.js';
import { useGuidedCode } from './useGuidedCode.js';

const spec = {
  language: 'html',
  starter: '<{{blank:a}}>x</h2>',
  blanks: [{ id: 'a', kind: 'text', answer: 'h2', accept: ['h2'] }],
} as unknown as CodeSpec;

function setup(withPort = true) {
  localStorage.clear();
  const play = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ActivityProvider i18n={createActivityI18n('pt')} sound={withPort ? { play } : undefined}>
      {children}
    </ActivityProvider>
  );
  const view = renderHook(() => useGuidedCode('guided-sound', spec, { onComplete: vi.fn() }), { wrapper });
  return { play, ...view };
}

describe('guided code sound', () => {
  it('plays wrong on a wrong verdict, then correct on the retry', () => {
    const { play, result } = setup();
    act(() => result.current.setValue('a', 'div'));
    act(() => result.current.submit());
    expect(play.mock.calls).toEqual([['wrong']]);
    act(() => result.current.retry());
    act(() => result.current.setValue('a', 'h2'));
    act(() => result.current.submit());
    expect(play.mock.calls).toEqual([['wrong'], ['correct']]);
  });

  it('does not sound the later completion, which the lesson already treats as a settle', () => {
    const { play, result } = setup();
    act(() => result.current.setValue('a', 'h2'));
    act(() => result.current.submit());
    play.mockClear();
    act(() => result.current.complete());
    expect(play).not.toHaveBeenCalled();
  });

  it('is silent without a port', () => {
    const { result } = setup(false);
    act(() => result.current.setValue('a', 'h2'));
    expect(() => act(() => result.current.submit())).not.toThrow();
  });
});
