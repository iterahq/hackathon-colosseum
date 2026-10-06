import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useResultBadge } from './useResultBadge.js';

type Pane = 'code' | 'preview';

function setup(initial: { pane: Pane; results: object | null }) {
  return renderHook((props: { pane: Pane; results: object | null }) => useResultBadge(props.pane, props.results), {
    initialProps: initial,
  });
}

describe('useResultBadge', () => {
  it('starts clean', () => {
    expect(setup({ pane: 'code', results: null }).result.current.unseen).toBe(false);
  });

  it('flags an edit made while the code pane is showing, and clears on opening the result', () => {
    const { result, rerender } = setup({ pane: 'code', results: null });
    act(() => result.current.markStale());
    expect(result.current.unseen).toBe(true);
    rerender({ pane: 'preview', results: null });
    expect(result.current.unseen).toBe(false);
  });

  it('does not flag an edit while the result is the pane in view', () => {
    const { result } = setup({ pane: 'preview', results: null });
    act(() => result.current.markStale());
    expect(result.current.unseen).toBe(false);
  });

  it('flags a new verdict, not the same one again', () => {
    const first = { ok: true };
    const { result, rerender } = setup({ pane: 'code', results: null });
    rerender({ pane: 'code', results: first });
    expect(result.current.unseen).toBe(true);
    rerender({ pane: 'preview', results: first });
    expect(result.current.unseen).toBe(false);
    rerender({ pane: 'code', results: first });
    expect(result.current.unseen).toBe(false);
    rerender({ pane: 'code', results: { ok: false } });
    expect(result.current.unseen).toBe(true);
  });

  it('does not flag results that were already there on mount', () => {
    expect(setup({ pane: 'code', results: { ok: true } }).result.current.unseen).toBe(false);
  });
});
