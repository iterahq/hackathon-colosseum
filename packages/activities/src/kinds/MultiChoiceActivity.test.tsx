import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MultiChoiceActivity } from './MultiChoiceActivity.js';
import type { PortableActivity } from '../renderer.js';

const activity = {
  id: 'mc-1',
  kind: 'multi_choice',
  status: 'todo',
  spec: {
    options: [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
    ],
    correct_option_ids: ['a', 'c'],
  },
} as unknown as PortableActivity;

describe('MultiChoiceActivity keyboard', () => {
  it('toggles options by letter and digit', () => {
    render(<MultiChoiceActivity activity={activity} onComplete={vi.fn()} />);
    const options = screen.getAllByTestId('multi-choice-option');
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: '2' });
    expect(options[0].getAttribute('data-selected')).toBe('true');
    expect(options[1].getAttribute('data-selected')).toBe('true');
    fireEvent.keyDown(window, { key: 'A' });
    expect(options[0].getAttribute('data-selected')).toBeNull();
  });

  it('submits on Enter and then marks the verdict', () => {
    const onComplete = vi.fn();
    render(<MultiChoiceActivity activity={activity} onComplete={onComplete} />);
    const byId = (id: string) =>
      screen.getAllByTestId('multi-choice-option').find((o) => o.getAttribute('data-option-id') === id) as HTMLElement;
    fireEvent.click(byId('a'));
    fireEvent.click(byId('b'));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onComplete).toHaveBeenCalledWith(false, expect.anything());
    expect(byId('a').getAttribute('data-verdict')).toBe('right');
    expect(byId('b').getAttribute('data-verdict')).toBe('miss');
    expect(byId('c').getAttribute('data-verdict')).toBe('right');
  });

  it('stamps each verdict on the corner when the options share a row', () => {
    render(<MultiChoiceActivity activity={activity} onComplete={vi.fn()} />);
    const byId = (id: string) =>
      screen.getAllByTestId('multi-choice-option').find((o) => o.getAttribute('data-option-id') === id) as HTMLElement;
    expect(screen.getByTestId('multi-choice-options').className).toContain('grid-cols-2 sm:grid-cols-3');
    expect(byId('a').getAttribute('data-compact')).toBe('true');
    fireEvent.click(byId('a'));
    fireEvent.click(byId('b'));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(byId('a').querySelector('[data-verdict-corner] [data-verdict-mark="right"]')).not.toBeNull();
    expect(byId('b').querySelector('[data-verdict-corner] [data-verdict-mark="miss"]')).not.toBeNull();
  });
});
