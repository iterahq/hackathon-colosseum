import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLensBadges } from './useLensBadges.js';

describe('useLensBadges', () => {
  it('flags a hidden lens that changed and clears it once opened', () => {
    const { result, rerender } = renderHook(
      ({ active, state }: { active: 'state' | 'flow'; state: string }) => useLensBadges(active, { state, flow: '0' }),
      { initialProps: { active: 'flow' as 'state' | 'flow', state: 'a' } },
    );
    expect(result.current('state')).toBe(false);

    rerender({ active: 'flow', state: 'b' });
    expect(result.current('state')).toBe(true);
    expect(result.current('flow')).toBe(false);

    act(() => rerender({ active: 'state', state: 'b' }));
    expect(result.current('state')).toBe(false);
  });

  it('never flags the lens being looked at', () => {
    const { result, rerender } = renderHook(
      ({ flow }: { flow: string }) => useLensBadges<'state' | 'flow'>('flow', { state: 'a', flow }),
      { initialProps: { flow: '0' } },
    );
    rerender({ flow: '1' });
    expect(result.current('flow')).toBe(false);
  });
});
