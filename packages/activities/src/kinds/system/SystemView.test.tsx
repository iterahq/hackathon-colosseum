import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SystemView } from './SystemView.js';
import type { ViewNode } from '../../specs.js';

const view: ViewNode = {
  id: 'app',
  type: 'box',
  children: [
    { id: 'title', type: 'heading', text: { bind: 'heading' } },
    { id: 'list', type: 'list', bind: 'tasks', empty: 'Nothing yet', item: { id: 'item', type: 'checkbox_item', text: { bind: 'title' }, checked: { bind: 'done' } } },
  ],
};

describe('SystemView', () => {
  it('renders bound text and suffixes list item ids with their index', () => {
    render(<SystemView view={view} state={{ heading: 'My tasks', tasks: [{ title: 'a', done: true }, { title: 'b', done: false }] }} />);
    expect(screen.getByTestId('system-node-title')).toHaveTextContent('My tasks');
    expect(screen.getByTestId('system-node-item#1')).toHaveTextContent('b');
    expect(screen.getByTestId('system-node-item#0').querySelector('[data-checked]')).toHaveAttribute('data-checked', 'true');
  });

  it('shows the empty text for an empty list', () => {
    render(<SystemView view={view} state={{ heading: 'x', tasks: [] }} />);
    expect(screen.getByTestId('system-node-list')).toHaveTextContent('Nothing yet');
  });

  it('makes leaves selectable and highlights a node id', () => {
    const onTap = vi.fn();
    render(
      <SystemView
        view={view}
        state={{ heading: 'x', tasks: [{ title: 'a', done: false }] }}
        selectable
        selected={new Set(['title'])}
        highlight={['list']}
        onTap={onTap}
      />,
    );
    expect(screen.getByTestId('system-node-title')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('system-node-list')).toHaveAttribute('data-highlighted', 'true');
    fireEvent.click(screen.getByTestId('system-node-item#0'));
    expect(onTap).toHaveBeenCalledWith('item#0');
  });
});
