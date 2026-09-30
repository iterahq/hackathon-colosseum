import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EventTraceActivity } from './EventTraceActivity.js';
import type { PortableActivity } from '../renderer.js';
import type { EventTraceSpec } from '../specs.js';

const spec: EventTraceSpec = {
  prompt: 'Click the first task.',
  reaction: 'A click becomes an action.',
  stamp: 'cause and effect',
  state: { tasks: [{ title: 'Coffee', done: false }] },
  view: {
    id: 'list',
    type: 'list',
    bind: 'tasks',
    item: { id: 'item', type: 'checkbox_item', text: { bind: 'title' }, checked: { bind: 'done' } },
  },
  trigger: { node: 'item#0' },
  steps: [
    { id: 'event', lens: 'event', label: 'click', highlight: 'item#0' },
    { id: 'state', lens: 'state', label: 'done: false → true', state_after: { tasks: [{ title: 'Coffee', done: true }] } },
    { id: 'render', lens: 'render', label: 'redrawn', highlight: 'item#0' },
  ],
  lenses: ['state'],
};

describe('EventTraceActivity', () => {
  const activity = { id: 'et-1', kind: 'event_trace', status: 'todo', spec } as unknown as PortableActivity;

  it('fires on the trigger, walks one step per tap and completes on the last one', () => {
    const onComplete = vi.fn();
    render(<EventTraceActivity activity={activity} onComplete={onComplete} />);
    expect(screen.queryByTestId('event-trace-next')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();

    fireEvent.click(screen.getByTestId('system-node-item#0'));
    expect(screen.getByTestId('event-trace-step-event')).toHaveAttribute('data-state', 'current');
    expect(screen.getByTestId('system-node-item#0')).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByTestId('event-trace-frozen')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('event-trace-next'));
    expect(screen.getByTestId('event-trace-panel-state')).toHaveTextContent('true');
    expect(screen.getByTestId('system-node-item#0').querySelector('[data-checked]')).toHaveAttribute('data-checked', 'true');
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('event-trace-next'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('event-trace-next')).toBeNull();
  });

  it('ignores taps on anything but the trigger', () => {
    const onComplete = vi.fn();
    render(<EventTraceActivity activity={{ ...activity, spec: { ...spec, trigger: { node: 'nowhere' } } } as PortableActivity} onComplete={onComplete} />);
    expect(screen.getByTestId('system-node-item#0').tagName).not.toBe('BUTTON');
    expect(screen.getByTestId('event-trace-step-event')).toHaveAttribute('data-state', 'hidden');
  });
});
