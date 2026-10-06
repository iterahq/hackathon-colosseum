import { afterEach, describe, expect, it, vi } from 'vitest';
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

  describe('on a phone', () => {
    const phone = { ...activity, spec: { ...spec, lenses: ['structure', 'state', 'flow'] } } as unknown as PortableActivity;
    const stubPhone = () =>
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('max-width'),
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
    afterEach(() => vi.unstubAllGlobals());

    it('folds the three lens panels into one tab list showing one panel', () => {
      stubPhone();
      render(<EventTraceActivity activity={phone} onComplete={vi.fn()} />);
      expect(screen.getByRole('tablist')).toBeInTheDocument();
      expect(screen.getAllByRole('tab')).toHaveLength(3);
      expect(screen.getByTestId('event-trace-tab-structure')).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tabpanel')).toBe(screen.getByTestId('event-trace-panel-structure'));
      expect(screen.queryByTestId('event-trace-panel-state')).toBeNull();

      fireEvent.click(screen.getByTestId('event-trace-tab-state'));
      expect(screen.getByTestId('event-trace-tab-state')).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('event-trace-tab-structure')).toHaveAttribute('aria-selected', 'false');
      expect(screen.getByTestId('event-trace-panel-state')).toBeInTheDocument();
    });

    it('marks a hidden lens as new when a step changes it and clears the mark on open', () => {
      stubPhone();
      render(<EventTraceActivity activity={phone} onComplete={vi.fn()} />);
      expect(screen.getByTestId('event-trace-tab-state')).not.toHaveAttribute('data-new');

      fireEvent.click(screen.getByTestId('system-node-item#0'));
      expect(screen.getByTestId('event-trace-tab-flow')).toHaveAttribute('data-new', 'true');
      expect(screen.getByTestId('event-trace-tab-structure')).not.toHaveAttribute('data-new');

      fireEvent.click(screen.getByTestId('event-trace-tab-flow'));
      expect(screen.getByTestId('event-trace-tab-flow')).not.toHaveAttribute('data-new');
    });

    it('moves between tabs with the arrow keys', () => {
      stubPhone();
      render(<EventTraceActivity activity={phone} onComplete={vi.fn()} />);
      fireEvent.keyDown(screen.getByTestId('event-trace-tab-structure'), { key: 'ArrowRight' });
      expect(screen.getByTestId('event-trace-tab-state')).toHaveAttribute('aria-selected', 'true');
      fireEvent.keyDown(screen.getByTestId('event-trace-tab-state'), { key: 'ArrowLeft' });
      expect(screen.getByTestId('event-trace-tab-structure')).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('keeps every panel on screen without tabs on a wide viewport', () => {
    render(<EventTraceActivity activity={{ ...activity, spec: { ...spec, lenses: ['structure', 'state', 'flow'] } } as unknown as PortableActivity} onComplete={vi.fn()} />);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByTestId('event-trace-panel-structure')).toBeInTheDocument();
    expect(screen.getByTestId('event-trace-panel-state')).toBeInTheDocument();
    expect(screen.getByTestId('event-trace-panel-flow')).toBeInTheDocument();
  });

  it('ignores taps on anything but the trigger', () => {
    const onComplete = vi.fn();
    render(<EventTraceActivity activity={{ ...activity, spec: { ...spec, trigger: { node: 'nowhere' } } } as PortableActivity} onComplete={onComplete} />);
    expect(screen.getByTestId('system-node-item#0').tagName).not.toBe('BUTTON');
    expect(screen.getByTestId('event-trace-step-event')).toHaveAttribute('data-state', 'hidden');
  });
});
