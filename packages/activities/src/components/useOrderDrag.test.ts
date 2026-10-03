import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { dragMove, useOrderDrag } from './useOrderDrag.js';

describe('dragMove', () => {
  it('reports the first and last index of the dragged item', () => {
    expect(dragMove(['a', 'b', 'c'], ['c', 'a', 'b'], 'c')).toEqual({ from: 2, to: 0 });
  });

  it('is null when the item ended where it began or is unknown', () => {
    expect(dragMove(['a', 'b'], ['a', 'b'], 'a')).toBeNull();
    expect(dragMove(['a', 'b'], ['b', 'a'], 'z')).toBeNull();
  });
});

describe('useOrderDrag', () => {
  const setup = (locked = false) => {
    const onDrop = vi.fn();
    const setOrder = vi.fn();
    const { result } = renderHook(() => useOrderDrag({ order: ['a', 'b', 'c'], locked, setOrder, onDrop }));
    return { result, onDrop, setOrder };
  };

  it('records one move per drag, however many rows it crossed', () => {
    const { result, onDrop } = setup();
    act(() => result.current.onDragStart('c'));
    act(() => result.current.onReorder(['a', 'c', 'b']));
    act(() => result.current.onReorder(['c', 'a', 'b']));
    act(() => result.current.onDragEnd());
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith('c', 2, 0);
  });

  it('records nothing when the row is dropped where it started', () => {
    const { result, onDrop } = setup();
    act(() => result.current.onDragStart('b'));
    act(() => result.current.onReorder(['b', 'a', 'c']));
    act(() => result.current.onReorder(['a', 'b', 'c']));
    act(() => result.current.onDragEnd());
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('ignores everything while locked', () => {
    const { result, onDrop, setOrder } = setup(true);
    act(() => result.current.onDragStart('c'));
    act(() => result.current.onReorder(['c', 'a', 'b']));
    act(() => result.current.onDragEnd());
    expect(setOrder).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
  });
});
