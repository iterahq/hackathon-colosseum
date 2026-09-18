import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useResendCooldown } from './useResendCooldown';

describe('useResendCooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts idle', () => {
    const { result } = renderHook(() => useResendCooldown(60));
    expect(result.current.isActive).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  it('arms the cooldown and counts down every second', () => {
    const { result } = renderHook(() => useResendCooldown(60));

    act(() => result.current.start());
    expect(result.current.isActive).toBe(true);
    expect(result.current.remaining).toBe(60);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(59);
  });

  it('goes idle again once the cooldown reaches zero', () => {
    const { result } = renderHook(() => useResendCooldown(3));

    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(3000));

    expect(result.current.remaining).toBe(0);
    expect(result.current.isActive).toBe(false);
  });

  it('restarting resets the countdown instead of stacking intervals', () => {
    const { result } = renderHook(() => useResendCooldown(60));

    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.remaining).toBe(30);

    act(() => result.current.start());
    expect(result.current.remaining).toBe(60);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(59);
  });

  it('can start armed, for a resend whose first send already happened', () => {
    const { result } = renderHook(() => useResendCooldown(60, { startActive: true }));
    expect(result.current.isActive).toBe(true);

    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.isActive).toBe(false);
  });
});
