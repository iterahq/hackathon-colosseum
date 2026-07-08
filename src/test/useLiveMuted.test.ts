import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLiveMuted } from '@/hooks/useLiveMuted';

beforeEach(() => localStorage.clear());

describe('useLiveMuted', () => {
  it('defaults to unmuted, then toggles and persists', () => {
    const { result } = renderHook(() => useLiveMuted());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem('itera.live.muted')).toBe('1');
  });

  it('reads the persisted value on mount', () => {
    localStorage.setItem('itera.live.muted', '1');
    const { result } = renderHook(() => useLiveMuted());
    expect(result.current[0]).toBe(true);
  });

  it('keeps two subscribers in sync', () => {
    const a = renderHook(() => useLiveMuted());
    const b = renderHook(() => useLiveMuted());
    act(() => a.result.current[1]());
    expect(b.result.current[0]).toBe(true);
  });
});
