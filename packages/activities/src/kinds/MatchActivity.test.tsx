import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MatchActivity } from './MatchActivity.js';
import type { PortableActivity } from '../renderer.js';

const activity = {
  id: 'match-1',
  kind: 'match',
  status: 'todo',
  spec: {
    left: [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
    ],
    right: [
      { id: 'ra', label: 'DefA' },
      { id: 'rb', label: 'DefB' },
    ],
    pairs: [
      { left_id: 'a', right_id: 'ra' },
      { left_id: 'b', right_id: 'rb' },
    ],
  },
} as unknown as PortableActivity;

const card = (label: string) => screen.getByText(label).closest('button') as HTMLButtonElement;

describe('MatchActivity connecting lines', () => {
  it('draws no wire until a pair exists, and removes it when the pair is undone', () => {
    render(<MatchActivity activity={activity} onComplete={vi.fn()} />);
    expect(screen.getByTestId('match-wires').querySelectorAll('path')).toHaveLength(0);
    fireEvent.click(card('Alpha'));
    fireEvent.click(card('DefA'));
    expect(screen.getByTestId('match-wires').querySelectorAll('path')).toHaveLength(1);
    fireEvent.click(card('DefA'));
    expect(screen.getByTestId('match-wires').querySelectorAll('path')).toHaveLength(0);
    expect(card('Alpha').getAttribute('data-connected')).toBeNull();
  });

  it('draws wrong pairs dashed and quiet, with dashed cards', () => {
    render(<MatchActivity activity={activity} onComplete={vi.fn()} />);
    fireEvent.click(card('Alpha'));
    fireEvent.click(card('DefB'));
    fireEvent.click(card('Beta'));
    fireEvent.click(card('DefA'));
    fireEvent.click(screen.getByTestId('match-submit'));
    const wires = Array.from(screen.getByTestId('match-wires').querySelectorAll('path'));
    expect(wires).toHaveLength(2);
    for (const w of wires) {
      expect(w.getAttribute('data-verdict')).toBe('miss');
      expect(w.getAttribute('stroke-dasharray')).toBe('6 6');
      expect(w.getAttribute('class')).not.toMatch(/destructive|red-/);
    }
    expect(card('Alpha').getAttribute('data-verdict')).toBe('miss');
    expect(card('DefA').getAttribute('data-verdict')).toBe('miss');
  });

  it('draws right pairs solid and green', () => {
    render(<MatchActivity activity={activity} onComplete={vi.fn()} />);
    fireEvent.click(card('Alpha'));
    fireEvent.click(card('DefA'));
    fireEvent.click(card('Beta'));
    fireEvent.click(card('DefB'));
    fireEvent.click(screen.getByTestId('match-submit'));
    for (const w of Array.from(screen.getByTestId('match-wires').querySelectorAll('path'))) {
      expect(w.getAttribute('data-verdict')).toBe('right');
      expect(w.getAttribute('stroke-dasharray')).not.toBe('6 6');
    }
    expect(card('Alpha').getAttribute('data-verdict')).toBe('right');
  });

  it('drags from the connector strip of a left card to a right card', () => {
    const onComplete = vi.fn();
    render(<MatchActivity activity={activity} onComplete={onComplete} />);
    const target = card('DefA');
    target.getBoundingClientRect = () => ({ left: 200, right: 300, top: 0, bottom: 50, width: 100, height: 50, x: 200, y: 0, toJSON: () => ({}) });
    const strip = card('Alpha').parentElement?.querySelector('[data-testid="match-connector"]') as HTMLElement;
    fireEvent.pointerDown(strip, { clientX: 100, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(strip, { clientX: 250, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(strip, { clientX: 250, clientY: 20, pointerId: 1 });
    expect(card('DefA').getAttribute('data-connected')).toBe('true');
    expect(card('Alpha').getAttribute('data-connected')).toBe('true');
  });

  it('never puts a card in two pairs when a paired left card is dragged to a free right card', () => {
    render(<MatchActivity activity={activity} onComplete={vi.fn()} />);
    fireEvent.click(card('Alpha'));
    fireEvent.click(card('DefA'));
    card('DefB').getBoundingClientRect = () => ({ left: 200, right: 300, top: 0, bottom: 50, width: 100, height: 50, x: 200, y: 0, toJSON: () => ({}) });
    const strip = card('Alpha').parentElement?.querySelector('[data-testid="match-connector"]') as HTMLElement;
    fireEvent.pointerDown(strip, { clientX: 100, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(strip, { clientX: 250, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(strip, { clientX: 250, clientY: 20, pointerId: 1 });
    expect(card('DefA').getAttribute('data-connected')).toBeNull();
    expect(card('DefB').getAttribute('data-connected')).toBe('true');
    expect(screen.getAllByTestId('match-badge')).toHaveLength(2);
    expect(screen.getByTestId('match-wires').querySelectorAll('path')).toHaveLength(1);
  });
});
