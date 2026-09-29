import { describe, expect, it, vi } from 'vitest';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { SpotActivity } from './SpotActivity.js';
import type { PortableActivity } from '../renderer.js';

const activity = {
  id: 'spot-1',
  kind: 'spot',
  status: 'todo',
  spec: {
    prompt: 'Tap the broken token.',
    reaction: 'A missing letter breaks everything.',
    stamp: 'a typo breaks it all',
    file: 'index.html',
    lines: [[{ text: '<h1 ' }, { text: 'clas', bug_id: 'typo' }, { text: '="title">Hi</h1>' }]],
    bugs: [{ id: 'typo', fixed_text: 'class' }],
    miss_hint: 'try again.',
  },
} as unknown as PortableActivity;

describe('SpotActivity keyboard', () => {
  it('Space on a token prevents the page scroll and taps the token', () => {
    const onComplete = vi.fn();
    render(<SpotActivity activity={activity} onComplete={onComplete} />);
    const token = screen.getByTestId('spot-token-typo');
    const space = createEvent.keyDown(token, { key: ' ' });
    fireEvent(token, space);
    expect(space.defaultPrevented).toBe(true);
    expect(token.textContent).toBe('class');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('Enter also prevents the default and other keys are left alone', () => {
    render(<SpotActivity activity={activity} onComplete={() => {}} />);
    const token = screen.getByTestId('spot-token-typo');
    const tab = createEvent.keyDown(token, { key: 'Tab' });
    fireEvent(token, tab);
    expect(tab.defaultPrevented).toBe(false);
    const enter = createEvent.keyDown(token, { key: 'Enter' });
    fireEvent(token, enter);
    expect(enter.defaultPrevented).toBe(true);
  });
});
