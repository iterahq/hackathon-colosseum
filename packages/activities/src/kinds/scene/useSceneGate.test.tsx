import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { ActivityProvider } from '../../context.js';
import { createActivityI18n } from '../../i18n/dictionary.js';
import { useSceneGate } from './useSceneGate.js';
import type { PortableActivity } from '../../renderer.js';

const scene = (status?: string) =>
  ({ id: 'scene-1', kind: 'xray', status, spec: {} }) as unknown as PortableActivity;

describe('useSceneGate', () => {
  it('opens solved when the activity is already done', () => {
    const { result } = renderHook(() => useSceneGate(scene('done'), vi.fn()));
    expect(result.current.solved).toBe(true);
  });

  it('opens unsolved once the activity is re-opened, and completes again on the gesture', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useSceneGate(scene(undefined), onComplete));
    expect(result.current.solved).toBe(false);
    result.current.open();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('useSceneGate sound', () => {
  const wrapper =
    (play: (cue: string) => void) =>
    ({ children }: { children: ReactNode }) => (
      <ActivityProvider i18n={createActivityI18n('pt')} sound={{ play }}>
        {children}
      </ActivityProvider>
    );

  it('plays complete once, and drops a step cue of the same action', () => {
    const play = vi.fn();
    const { result } = renderHook(() => useSceneGate(scene(undefined), vi.fn()), { wrapper: wrapper(play) });
    act(() => {
      result.current.open();
      result.current.step('connect');
      result.current.open();
    });
    expect(play.mock.calls).toEqual([['complete']]);
  });

  it('plays a step cue on its own', () => {
    const play = vi.fn();
    const { result } = renderHook(() => useSceneGate(scene(undefined), vi.fn()), { wrapper: wrapper(play) });
    act(() => result.current.step('pick'));
    expect(play.mock.calls).toEqual([['pick']]);
  });

  it('is silent for an already done activity and without a port', () => {
    const play = vi.fn();
    const done = renderHook(() => useSceneGate(scene('done'), vi.fn()), { wrapper: wrapper(play) });
    act(() => done.result.current.open());
    expect(play).not.toHaveBeenCalled();
    const bare = renderHook(() => useSceneGate(scene(undefined), vi.fn()));
    expect(() => act(() => bare.result.current.step('pick'))).not.toThrow();
  });
});
