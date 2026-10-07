import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SingleChoiceActivity } from './SingleChoiceActivity.js';
import type { PortableActivity } from '../renderer.js';

const activity = {
  id: 'sc-1',
  kind: 'single_choice',
  status: 'todo',
  spec: {
    options: [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
    ],
    correct_option_id: 'b',
  },
} as unknown as PortableActivity;

const option = (id: string) =>
  screen.getAllByTestId('single-choice-option').find((o) => o.getAttribute('data-option-id') === id) as HTMLElement;
const letterOf = (id: string) => option(id).querySelector('[data-key]')?.getAttribute('data-key');

describe('SingleChoiceActivity keyboard', () => {
  it('picks the option a letter or digit names, wherever the shuffle put it', () => {
    render(<SingleChoiceActivity activity={activity} onComplete={vi.fn()} />);
    const options = screen.getAllByTestId('single-choice-option');
    fireEvent.keyDown(window, { key: 'b' });
    expect(options[1].getAttribute('data-selected')).toBe('true');
    fireEvent.keyDown(window, { key: '3' });
    expect(options[2].getAttribute('data-selected')).toBe('true');
    expect(options[1].getAttribute('data-selected')).toBeNull();
    expect(letterOf(options[0].getAttribute('data-option-id') as string)).toBe('A');
  });

  it('ignores keys typed into a text field and keys that name no option', () => {
    render(
      <>
        <input data-testid="field" />
        <SingleChoiceActivity activity={activity} onComplete={vi.fn()} />
      </>,
    );
    fireEvent.keyDown(screen.getByTestId('field'), { key: 'a' });
    fireEvent.keyDown(window, { key: 'z' });
    fireEvent.keyDown(window, { key: '9' });
    screen.getAllByTestId('single-choice-option').forEach((o) => expect(o.getAttribute('data-selected')).toBeNull());
  });

  it('submits on Enter only once there is a pick, and not after it is locked', () => {
    const onComplete = vi.fn();
    render(<SingleChoiceActivity activity={activity} onComplete={onComplete} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onComplete).not.toHaveBeenCalled();
    const second = screen.getAllByTestId('single-choice-option')[1];
    fireEvent.keyDown(window, { key: 'b' });
    fireEvent.keyDown(second, { key: 'Enter' });
    expect(onComplete).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('single-choice-option')[0].getAttribute('data-selected')).toBeNull();
  });

  it('stops listening once unmounted', () => {
    const { unmount } = render(<SingleChoiceActivity activity={activity} onComplete={vi.fn()} />);
    unmount();
    expect(() => fireEvent.keyDown(window, { key: 'a' })).not.toThrow();
  });

  it('marks the verdict with data attributes, never red', () => {
    render(<SingleChoiceActivity activity={activity} onComplete={vi.fn()} />);
    fireEvent.click(option('a'));
    fireEvent.click(screen.getByTestId('single-choice-submit'));
    expect(option('a').getAttribute('data-verdict')).toBe('miss');
    expect(option('b').getAttribute('data-verdict')).toBe('right');
    expect(option('c').getAttribute('data-verdict')).toBeNull();
    expect(option('c').className).toContain('opacity-60');
    expect(screen.getByTestId('single-choice-options').innerHTML).not.toMatch(/destructive|red-/);
  });

  it('stamps the verdict on the corner when the options share a row, so the label keeps the width', () => {
    render(<SingleChoiceActivity activity={activity} onComplete={vi.fn()} />);
    expect(screen.getByTestId('single-choice-options').className).toContain('grid-cols-2');
    expect(option('a').getAttribute('data-compact')).toBe('true');
    fireEvent.click(option('a'));
    fireEvent.click(screen.getByTestId('single-choice-submit'));
    expect(option('b').querySelector('[data-verdict-corner] [data-verdict-mark="right"]')).not.toBeNull();
    expect(option('a').querySelector('[data-verdict-corner] [data-verdict-mark="miss"]')).not.toBeNull();
    expect(option('c').querySelector('[data-verdict-corner]')).toBeNull();
  });

  it('keeps the verdict beside the label of a full-width option', () => {
    const sentences = {
      ...activity,
      spec: {
        options: [
          { id: 'a', label: 'The browser reads the file from top to bottom' },
          { id: 'b', label: 'The browser reads the head last' },
        ],
        correct_option_id: 'a',
      },
    } as unknown as PortableActivity;
    render(<SingleChoiceActivity activity={sentences} onComplete={vi.fn()} />);
    expect(screen.getByTestId('single-choice-options').className).not.toContain('grid-cols');
    expect(option('a').getAttribute('data-compact')).toBeNull();
    fireEvent.click(option('a'));
    fireEvent.click(screen.getByTestId('single-choice-submit'));
    expect(option('a').querySelector('[data-verdict-mark="right"]')).not.toBeNull();
    expect(option('a').querySelector('[data-verdict-corner]')).toBeNull();
  });
});
