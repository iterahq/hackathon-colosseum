import { act } from '@testing-library/react';
import type { ReactNode } from 'react';

type Handlers = { onDragStart?: () => void; onDragEnd?: () => void };

const rows = new Map<string, Handlers>();
let group: { values: string[]; onReorder: (next: string[]) => void } | null = null;

type GroupProps = {
  values: string[];
  onReorder: (next: string[]) => void;
  children: ReactNode;
  [rest: string]: unknown;
};
type ItemProps = Handlers & {
  value: string;
  children: ReactNode;
  [rest: string]: unknown;
};

/**
 * framer's `Reorder` needs real layout to reorder, which jsdom does not have. This
 * keeps the markup and the drag callbacks the Order kind wires, and lets a test
 * play the drag through `dragOrderRow`.
 */
export function withReorderDouble<T extends object>(actual: T): T {
  function Group({ values, onReorder, children, as: _as, axis: _axis, ...rest }: GroupProps) {
    group = { values, onReorder };
    return <ol {...rest}>{children}</ol>;
  }
  function Item({
    value,
    onDragStart,
    onDragEnd,
    children,
    as: _as,
    dragListener: _dragListener,
    dragControls: _dragControls,
    transition: _transition,
    whileDrag: _whileDrag,
    ...rest
  }: ItemProps) {
    rows.set(value, { onDragStart, onDragEnd });
    return <li {...rest}>{children}</li>;
  }
  return { ...actual, Reorder: { Group, Item } };
}

/** Plays one drag of the row with this authored id to the 0-based `toIndex`. */
export function dragOrderRow(id: string, toIndex: number) {
  const handlers = rows.get(id);
  if (!group || !handlers) throw new Error(`orderDragDouble: no row ${id}; mock framer-motion first`);
  const next = [...group.values];
  next.splice(next.indexOf(id), 1);
  next.splice(toIndex, 0, id);
  const { onReorder } = group;
  act(() => {
    handlers.onDragStart?.();
    onReorder(next);
    handlers.onDragEnd?.();
  });
}
