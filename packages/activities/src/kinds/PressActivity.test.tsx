import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PressActivity } from './PressActivity.js';
import type { PortableActivity } from '../renderer.js';

const activity = {
  id: 'press-1',
  kind: 'press',
  status: 'todo',
  spec: {
    prompt: 'Wire the button.',
    reaction: 'onclick binds the gesture.',
    stamp: 'onclick binds the gesture to code',
    file: 'button.js',
    before: [],
    options: [
      { id: 'onclick', label: 'on click', code: 'button.onclick = toggle;' },
      { id: 'oninput', label: 'on input', code: 'button.oninput = toggle;' },
    ],
    correct: 'onclick',
    wrong_hint: 'that event does not fire on click.',
    button: 'press me',
    goal: 2,
    effect: { type: 'toggle_class', target_id: 'title', class_name: 'aceso' },
    page: { elements: [{ id: 'title', tag: 'h1', text: 'Lamp', name: 'title' }] },
  },
} as unknown as PortableActivity;

describe('PressActivity toggle_class', () => {
  it('marks the target as toggled with a visible style, and clears it on the next press', () => {
    const onComplete = vi.fn();
    render(<PressActivity activity={activity} onComplete={onComplete} />);
    const target = screen.getByTestId('press-target');
    expect(target.dataset.toggled).toBe('false');
    expect(target.className).not.toContain('bg-amber-200');

    fireEvent.click(screen.getByTestId('press-option-onclick'));
    fireEvent.click(screen.getByTestId('press-button'));
    expect(target.dataset.toggled).toBe('true');
    expect(target.className).toContain('bg-amber-200');
    expect(target.className).toContain('aceso');
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('press-button'));
    expect(target.dataset.toggled).toBe('false');
    expect(target.className).not.toContain('aceso');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
