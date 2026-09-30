import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ComposeBlocksActivity } from './ComposeBlocksActivity.js';
import { treeMatches, type PlacedNode } from './system/composeTree.js';
import type { PortableActivity } from '../renderer.js';
import type { ComposeBlocksSpec } from '../specs.js';

const spec: ComposeBlocksSpec = {
  prompt: 'Build the screen.',
  reaction: 'Blocks inside blocks.',
  stamp: 'composition',
  wrong_hint: 'not there',
  blocks: [
    { id: 'app', label: 'App', view: { id: 'app', type: 'box', children: [] } },
    { id: 'header', label: 'Header', view: { id: 'header', type: 'heading', text: 'Tasks' } },
    { id: 'list', label: 'List', view: { id: 'list', type: 'box', children: [] } },
    { id: 'item', label: 'Item', view: { id: 'item', type: 'checkbox_item', text: { bind: 'title' }, checked: { bind: 'done' } } },
  ],
  root: 'app',
  target: { block: 'app', children: [{ block: 'header' }, { block: 'list', children: [{ block: 'item' }] }] },
};

describe('treeMatches', () => {
  const tree: PlacedNode = {
    uid: 'root',
    block: 'app',
    children: [
      { uid: 'a', block: 'list', children: [{ uid: 'b', block: 'item', children: [] }] },
      { uid: 'c', block: 'header', children: [] },
    ],
  };
  it('ignores sibling order unless the author asks for it', () => {
    expect(treeMatches(tree, spec.target, false)).toBe(true);
    expect(treeMatches(tree, spec.target, true)).toBe(false);
  });
});

describe('ComposeBlocksActivity', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const activity = { id: 'cb-1', kind: 'compose_blocks', status: 'todo', spec } as unknown as PortableActivity;
  const place = (block: string, slot: string) => {
    fireEvent.click(screen.getByTestId(`compose-block-${block}`));
    fireEvent.click(screen.getByTestId(`compose-slot-${slot}`));
  };

  it('bounces a block that does not belong under that parent, and completes on the target tree', () => {
    const onComplete = vi.fn();
    render(<ComposeBlocksActivity activity={activity} onComplete={onComplete} />);

    place('item', 'root');
    expect(screen.getByTestId('scene-wrong-hint')).toHaveTextContent('not there');
    expect(screen.queryByTestId('compose-node-n1')).toBeNull();

    place('header', 'root');
    place('list', 'root');
    expect(screen.getByTestId('compose-preview')).toHaveTextContent('Tasks');
    place('item', 'n2');
    expect(screen.getByTestId('compose-preview')).toHaveTextContent('Item');
    expect(onComplete).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(800));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
