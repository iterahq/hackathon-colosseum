import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { OrderActivity } from './OrderActivity.js';
import type { PortableActivity } from '../renderer.js';

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
  it('moves a row with the buttons and records one item_moved via button', () => {
    const onComplete = vi.fn();
    render(<OrderActivity activity={activity} onComplete={onComplete} />);
    const before = ids();
    fireEvent.click(screen.getAllByTestId('order-down')[0]);
    const after = ids();
    expect(after[1]).toBe(before[0]);
    fireEvent.click(screen.getByTestId('order-submit'));
    const detail = onComplete.mock.calls[0][1];
    const moves = detail.actions.filter((a: { type: string }) => a.type === 'item_moved');
    expect(moves).toHaveLength(1);
    expect(moves[0].payload).toMatchObject({ item_id: before[0], from: 0, to: 1, via: 'button' });
  });

  it('keeps the submit disabled until something moved', () => {
    render(<OrderActivity activity={activity} onComplete={vi.fn()} />);
    expect((screen.getByTestId('order-submit') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getAllByTestId('order-down')[0]);
    expect((screen.getByTestId('order-submit') as HTMLButtonElement).disabled).toBe(false);
  });

  it('marks each row right or miss after submit and keeps the rows mounted and locked', () => {
    render(<OrderActivity activity={activity} onComplete={vi.fn()} />);
    fireEvent.click(screen.getAllByTestId('order-down')[0]);
    fireEvent.click(screen.getByTestId('order-submit'));
    const rows = screen.getAllByTestId('order-item');
    expect(rows).toHaveLength(3);
    rows.forEach((r, i) => {
      const right = ['a', 'b', 'c'][i] === r.getAttribute('data-option-id');
      expect(r.getAttribute('data-verdict')).toBe(right ? 'right' : 'miss');
    });
    screen.getAllByTestId('order-up').forEach((b) => expect((b as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByTestId('order-list').innerHTML).not.toMatch(/destructive|red-/);
  });
});
