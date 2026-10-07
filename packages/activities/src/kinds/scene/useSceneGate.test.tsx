import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
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
