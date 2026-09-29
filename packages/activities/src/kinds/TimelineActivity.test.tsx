import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TimelineActivity } from './TimelineActivity.js';
import type { PortableActivity } from '../renderer.js';

const activity = {
  id: 'timeline-1',
  kind: 'timeline',
  status: 'todo',
  spec: {
    prompt: 'Walk the commits.',
    reaction: 'Each commit is a photo.',
    stamp: 'a commit is a snapshot',
    axis: 'commit',
    steps: ['one', 'two', 'three'].map((label) => ({
      label,
      note: `note ${label}`,
      frame: { type: 'code', lines: [`// ${label}`] },
    })),
  },
} as unknown as PortableActivity;

const scrub = (value: number) =>
  fireEvent.change(screen.getByTestId('timeline-scrubber'), { target: { value: String(value) } });

describe('TimelineActivity', () => {
  it('completes exactly once, after every step was visited', () => {
    const onComplete = vi.fn();
    render(<TimelineActivity activity={activity} onComplete={onComplete} />);
    scrub(1);
    expect(onComplete).not.toHaveBeenCalled();
    scrub(2);
    expect(onComplete).toHaveBeenCalledTimes(1);
    scrub(0);
    scrub(2);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not update the parent while the timeline renders', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Host = () => {
      const [done, setDone] = useState(false);
      return (
        <>
          <span data-testid="host-done">{String(done)}</span>
          <TimelineActivity activity={activity} onComplete={() => setDone(true)} />
        </>
      );
    };
    render(<Host />);
    scrub(1);
    scrub(2);
    expect(screen.getByTestId('host-done').textContent).toBe('true');
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
