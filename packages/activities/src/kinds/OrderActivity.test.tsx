import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { OrderActivity } from './OrderActivity.js';
import type { PortableActivity } from '../renderer.js';

type DragHandlers = { onDragStart?: () => void; onDragEnd?: () => void };
const dragState = vi.hoisted(() => ({
  rows: new Map<string, { onDragStart?: () => void; onDragEnd?: () => void }>(),
  group: null as { values: string[]; onReorder: (next: string[]) => void } | null,
}));

// framer's Reorder needs real layout, which jsdom lacks: keep the markup and the
// drag callbacks the kind wires, and play the drag through `drag()` below.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<object>();
  const Group = ({ values, onReorder, children, as: _as, axis: _axis, ...rest }: {
    values: string[];
    onReorder: (next: string[]) => void;
    children: ReactNode;
    [rest: string]: unknown;
  }) => {
    dragState.group = { values, onReorder };
    return <ol {...rest}>{children}</ol>;
  };
  const Item = ({ value, onDragStart, onDragEnd, children, as: _as, dragListener: _dl, dragControls: _dc, transition: _t, whileDrag: _w, ...rest }: DragHandlers & {
    value: string;
    children: ReactNode;
    [rest: string]: unknown;
  }) => {
    dragState.rows.set(value, { onDragStart, onDragEnd });
    return <li {...rest}>{children}</li>;
  };
  return { ...actual, Reorder: { Group, Item } };
});

function drag(id: string, toIndex: number) {
  const handlers = dragState.rows.get(id)!;
  const { values, onReorder } = dragState.group!;
  const next = [...values];
  next.splice(next.indexOf(id), 1);
  next.splice(toIndex, 0, id);
  act(() => {
    handlers.onDragStart?.();
    onReorder(next);
    handlers.onDragEnd?.();
  });
}

const activity = {
  id: 'ord-1',
  kind: 'order',
  status: 'todo',
  spec: {
    items: [
      { id: 'a', label: 'First' },
      { id: 'b', label: 'Second' },
      { id: 'c', label: 'Third' },
    ],
    correct_order: ['a', 'b', 'c'],
  },
} as unknown as PortableActivity;

const ids = () => screen.getAllByTestId('order-item').map((r) => r.getAttribute('data-option-id'));

describe('OrderActivity', () => {
  it('moves a row by dragging and records one item_moved via drag', () => {
    const onComplete = vi.fn();
    render(<OrderActivity activity={activity} onComplete={onComplete} />);
    const before = ids();
    drag(before[0]!, 1);
    const after = ids();
    expect(after[1]).toBe(before[0]);
    fireEvent.click(screen.getByTestId('order-submit'));
    const detail = onComplete.mock.calls[0][1];
    const moves = detail.actions.filter((a: { type: string }) => a.type === 'item_moved');
    expect(moves).toHaveLength(1);
    expect(moves[0].payload).toMatchObject({ item_id: before[0], from: 0, to: 1, via: 'drag' });
  });

  it('has no arrow buttons, only the grip of each row', () => {
    render(<OrderActivity activity={activity} onComplete={vi.fn()} />);
    expect(screen.queryAllByTestId('order-up')).toHaveLength(0);
    expect(screen.queryAllByTestId('order-down')).toHaveLength(0);
    expect(screen.getAllByTestId('order-grip')).toHaveLength(3);
  });

  it('keeps the submit disabled until something moved', () => {
    render(<OrderActivity activity={activity} onComplete={vi.fn()} />);
    expect((screen.getByTestId('order-submit') as HTMLButtonElement).disabled).toBe(true);
    drag(ids()[0]!, 1);
    expect((screen.getByTestId('order-submit') as HTMLButtonElement).disabled).toBe(false);
  });

  it('leaves the row transform to the drag: no CSS transition competes with it', () => {
    render(<OrderActivity activity={activity} onComplete={vi.fn()} />);
    screen.getAllByTestId('order-item').forEach((row) => {
      expect(row.className).not.toMatch(/transition-\[[^\]]*transform/);
    });
  });

  it('marks each row right or miss after submit and keeps the rows mounted and locked', () => {
    render(<OrderActivity activity={activity} onComplete={vi.fn()} />);
    drag(ids()[0]!, 1);
    fireEvent.click(screen.getByTestId('order-submit'));
    const rows = screen.getAllByTestId('order-item');
    expect(rows).toHaveLength(3);
    rows.forEach((r, i) => {
      const right = ['a', 'b', 'c'][i] === r.getAttribute('data-option-id');
      expect(r.getAttribute('data-verdict')).toBe(right ? 'right' : 'miss');
    });
    const lockedOrder = ids();
    drag(lockedOrder[0]!, 2);
    expect(ids()).toEqual(lockedOrder);
    expect(screen.getByTestId('order-list').innerHTML).not.toMatch(/destructive|red-/);
  });
});
