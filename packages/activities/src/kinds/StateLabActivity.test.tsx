import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { StateLabActivity } from './StateLabActivity.js';
import { applyControl } from './system/stateOps.js';
import type { PortableActivity } from '../renderer.js';
import type { StateLabSpec } from '../specs.js';

const spec: StateLabSpec = {
  prompt: 'Change the state.',
  reaction: 'The screen is the state drawn.',
  stamp: 'state becomes screen',
  state: { tasks: [{ title: 'Coffee', done: false }], name: 'x' },
  view: {
    id: 'list',
    type: 'list',
    bind: 'tasks',
    empty: 'No tasks',
    item: { id: 'item', type: 'checkbox_item', text: { bind: 'title' }, checked: { bind: 'done' } },
  },
  controls: [
    { id: 'toggle', path: 'tasks.0.done', type: 'toggle', label: 'Coffee done' },
    { id: 'add', path: 'tasks', type: 'add_item', label: 'Add', template: { title: 'New', done: false } },
    { id: 'remove', path: 'tasks', type: 'remove_item', label: 'Remove' },
  ],
  goals: [{ path: 'tasks.0.done', equals: true, label: 'Coffee is done' }],
};

describe('applyControl', () => {
  it('toggles, appends, removes and edits without mutating the input', () => {
    const state = spec.state;
    expect(applyControl(state, spec.controls[0])).toEqual({ ...state, tasks: [{ title: 'Coffee', done: true }] });
    expect((applyControl(state, spec.controls[1]).tasks as unknown[]).length).toBe(2);
    expect(applyControl(state, spec.controls[2]).tasks).toEqual([]);
    expect(applyControl(state, { id: 't', path: 'name', type: 'text' }, 'y').name).toBe('y');
    expect(applyControl(state, { id: 'r', path: 'tasks.0', type: 'remove_item' }).tasks).toEqual([]);
    expect(state.tasks).toEqual([{ title: 'Coffee', done: false }]);
  });
});

describe('StateLabActivity', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('re-renders the interface from the state and completes when every goal holds', () => {
    const onComplete = vi.fn();
    const activity = { id: 'sl-1', kind: 'state_lab', status: 'todo', spec } as unknown as PortableActivity;
    render(<StateLabActivity activity={activity} onComplete={onComplete} />);

    fireEvent.click(screen.getByTestId('state-lab-control-remove'));
    expect(screen.getByTestId('state-lab-view')).toHaveTextContent('No tasks');
    fireEvent.click(screen.getByTestId('state-lab-control-add'));
    expect(screen.getByTestId('system-node-item#0')).toHaveTextContent('New');
    fireEvent.click(screen.getByTestId('state-lab-control-toggle'));
    expect(screen.getByTestId('state-lab-goal-0')).toHaveAttribute('data-met', 'true');
    expect(onComplete).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(800));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
