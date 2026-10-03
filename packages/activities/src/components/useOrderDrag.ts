import { useRef } from 'react';

/** Where a dragged item started and ended, or null when the drop changed nothing. */
export function dragMove(startOrder: string[], endOrder: string[], id: string): { from: number; to: number } | null {
  const from = startOrder.indexOf(id);
  const to = endOrder.indexOf(id);
  return from === -1 || to === -1 || from === to ? null : { from, to };
}

/**
 * The bookkeeping of dragging a row through a `Reorder.Group`: the list
 * reshuffles on every row the pointer crosses, but only the DROP is a move, so
 * `onDrop` fires once per drag that actually changed the order.
 */
export function useOrderDrag({
  order,
  locked,
  setOrder,
  onDrop,
}: {
  order: string[];
  locked: boolean;
  setOrder: (next: string[]) => void;
  onDrop: (id: string, from: number, to: number) => void;
}) {
  const live = useRef(order);
  live.current = order;
  const start = useRef<{ id: string; order: string[] } | null>(null);

  return {
    onReorder(next: string[]) {
      if (locked) return;
      live.current = next;
      setOrder(next);
    },
    onDragStart(id: string) {
      start.current = { id, order: [...live.current] };
    },
    onDragEnd() {
      const s = start.current;
      start.current = null;
      if (!s || locked) return;
      const moved = dragMove(s.order, live.current, s.id);
      if (moved) onDrop(s.id, moved.from, moved.to);
    },
  };
}
