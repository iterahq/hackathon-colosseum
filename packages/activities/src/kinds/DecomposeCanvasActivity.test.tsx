import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DecomposeCanvasActivity } from './DecomposeCanvasActivity.js';
import { judgeDecomposition, regionSegments, restorableAssignment } from './system/decomposeJudge.js';
import { renderedLeafIds } from './system/viewModel.js';
import type { PortableActivity } from '../renderer.js';
import type { DecomposeCanvasSpec, ViewNode } from '../specs.js';

const view: ViewNode = {
  id: 'app',
  type: 'box',
  children: [
    { id: 'title', type: 'heading', text: 'Tasks' },
    { id: 'add', type: 'box', children: [{ id: 'new', type: 'input' }, { id: 'add_btn', type: 'button', text: 'Add' }] },
    { id: 'list', type: 'list', bind: 'tasks', item: { id: 'item', type: 'checkbox_item', text: { bind: 'title' }, checked: { bind: 'done' } } },
  ],
};

const spec: DecomposeCanvasSpec = {
  prompt: 'Group the parts.',
  reaction: 'Each part has one job.',
  stamp: 'decomposition',
  view,
  state: { tasks: [{ title: 'a', done: false }, { title: 'b', done: false }] },
  parts: [
    { id: 'header', label: 'Header' },
    { id: 'add', label: 'Add task' },
    { id: 'list', label: 'Task list' },
    { id: 'item', label: 'Task item', inside: 'list' },
  ],
  must_group: [{ ids: ['new', 'add_btn'], hint: 'field and button go together' }, { ids: ['item'] }],
  must_separate: [{ ids: ['title', 'new'], hint: 'the title is not part of adding' }],
};

const leaves = renderedLeafIds(view, spec.state);

describe('judgeDecomposition', () => {
  it('expands list items against the state', () => {
    expect(leaves).toEqual(['title', 'new', 'add_btn', 'item#0', 'item#1']);
  });

  it('accepts any grouping that satisfies every constraint — there is no answer key', () => {
    const base = { title: 'header', new: 'add', add_btn: 'add' };
    expect(judgeDecomposition(spec, leaves, { ...base, 'item#0': 'item', 'item#1': 'item' })).toEqual({ ok: true });
    expect(judgeDecomposition(spec, leaves, { ...base, 'item#0': 'list', 'item#1': 'list' })).toEqual({ ok: true });
  });

  it('reports the first violated constraint with its hint', () => {
    const verdict = judgeDecomposition(spec, leaves, {
      title: 'header',
      new: 'header',
      add_btn: 'add',
      'item#0': 'item',
      'item#1': 'item',
    });
    expect(verdict).toMatchObject({ ok: false, reason: 'must_group', index: 0, hint: 'field and button go together' });
  });

  it('reports a must_separate violation', () => {
    const verdict = judgeDecomposition(spec, leaves, {
      title: 'add',
      new: 'add',
      add_btn: 'add',
      'item#0': 'item',
      'item#1': 'item',
    });
    expect(verdict).toMatchObject({ ok: false, reason: 'must_separate', index: 0 });
  });

  it('requires every leaf assigned unless the author opts out', () => {
    expect(judgeDecomposition(spec, leaves, { new: 'add', add_btn: 'add' })).toMatchObject({ reason: 'unassigned' });
    expect(
      judgeDecomposition({ ...spec, require_all_assigned: false }, leaves, {
        new: 'add',
        add_btn: 'add',
        'item#0': 'item',
        'item#1': 'item',
      }),
    ).toEqual({ ok: true });
  });
});

describe('regionSegments', () => {
  it('outlines each repeated list item on its own', () => {
    expect(regionSegments(['item#0', 'item#1'], leaves, true)).toEqual([['item#0'], ['item#1']]);
  });

  it('keeps a container part as one outline around its items', () => {
    expect(regionSegments(['item#0', 'item#1'], leaves, false)).toEqual([['item#0', 'item#1']]);
  });

  it('splits non-contiguous leaves instead of boxing the leaves between them', () => {
    expect(regionSegments(['title', 'add_btn'], leaves, true)).toEqual([['title'], ['add_btn']]);
    expect(regionSegments(['new', 'add_btn'], leaves, true)).toEqual([['new', 'add_btn']]);
  });
});

describe('restorableAssignment', () => {
  const right = [
    ['title', 'header'],
    ['new', 'add'],
    ['add_btn', 'add'],
    ['item#0', 'item'],
    ['item#1', 'item'],
  ];

  it('restores a recorded assignment the judge still accepts', () => {
    expect(restorableAssignment(right, spec, leaves)).toEqual(Object.fromEntries(right));
  });

  it('restores nothing from an unknown id, a duplicate or a wrong grouping', () => {
    expect(restorableAssignment([...right.slice(1), ['ghost', 'header']], spec, leaves)).toBeUndefined();
    expect(restorableAssignment([...right, ['title', 'add']], spec, leaves)).toBeUndefined();
    expect(restorableAssignment([['title', 'header'], ['new', 'header'], ...right.slice(2)], spec, leaves)).toBeUndefined();
    expect(restorableAssignment({ title: 'header' }, spec, leaves)).toBeUndefined();
  });
});

describe('DecomposeCanvasActivity', () => {
  const activity = { id: 'dc-1', kind: 'decompose_canvas', status: 'todo', spec } as unknown as PortableActivity;

  const group = (ids: string[], part: string) => {
    ids.forEach((id) => fireEvent.click(screen.getByTestId(`system-node-${id}`)));
    fireEvent.click(screen.getByTestId(`decompose-part-${part}`));
  };

  it('stays gated until Verificar passes every constraint, then completes once', () => {
    const onComplete = vi.fn();
    render(<DecomposeCanvasActivity activity={activity} onComplete={onComplete} />);
    expect(screen.getByTestId('decompose-verify')).toBeDisabled();

    group(['title', 'new'], 'header');
    group(['add_btn'], 'add');
    group(['item#0', 'item#1'], 'item');
    fireEvent.click(screen.getByTestId('decompose-verify'));
    expect(screen.getByTestId('scene-wrong-hint')).toHaveTextContent('field and button go together');
    expect(onComplete).not.toHaveBeenCalled();

    group(['new'], 'add');
    fireEvent.click(screen.getByTestId('decompose-verify'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toBe(true);
    expect(screen.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'true');
    const gate = onComplete.mock.calls[0][1].actions.find((a: { type: string }) => a.type === 'gate_opened');
    expect(gate.payload.assignment).toEqual([
      ['title', 'header'],
      ['new', 'add'],
      ['add_btn', 'add'],
      ['item#0', 'item'],
      ['item#1', 'item'],
    ]);
  });

  it('draws one outline per task item, inside one list outline', () => {
    render(<DecomposeCanvasActivity activity={activity} onComplete={vi.fn()} />);
    group(['item#0', 'item#1'], 'item');
    expect(document.querySelectorAll('[data-region="item"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-region="list"]')).toHaveLength(1);
  });

  it('redraws the learner\'s own parts when a done activity gets its prior answer back', () => {
    const onComplete = vi.fn();
    const { unmount } = render(<DecomposeCanvasActivity activity={activity} onComplete={onComplete} />);
    group(['title'], 'header');
    group(['new', 'add_btn'], 'add');
    group(['item#0', 'item#1'], 'item');
    fireEvent.click(screen.getByTestId('decompose-verify'));
    const prior = onComplete.mock.calls[0][1];
    unmount();

    render(
      <DecomposeCanvasActivity activity={{ ...activity, status: 'done' }} onComplete={onComplete} priorAnswer={prior} />,
    );
    expect(screen.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'true');
    expect(document.querySelectorAll('[data-region="item"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-region="add"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-region="header"]')).toHaveLength(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('clears the selection and toggles a leaf off', () => {
    render(<DecomposeCanvasActivity activity={activity} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByTestId('system-node-title'));
    fireEvent.click(screen.getByTestId('system-node-new'));
    expect(screen.getByTestId('system-node-title')).toHaveAttribute('data-selected', 'true');
    fireEvent.click(screen.getByTestId('system-node-title'));
    expect(screen.getByTestId('system-node-title')).not.toHaveAttribute('data-selected');
    fireEvent.click(screen.getByTestId('decompose-clear-selection'));
    expect(screen.getByTestId('system-node-new')).not.toHaveAttribute('data-selected');
    expect(screen.getByTestId('decompose-instruction')).toHaveTextContent('Toque nos elementos');
  });

  it('releases an assigned leaf through its part chip row', () => {
    const onComplete = vi.fn();
    render(<DecomposeCanvasActivity activity={activity} onComplete={onComplete} />);
    expect(screen.getByTestId('decompose-unassign')).toBeDisabled();
    group(['title'], 'header');
    expect(document.querySelectorAll('[data-region="header"]')).toHaveLength(1);
    expect(screen.getByTestId('decompose-unassign')).toBeDisabled();

    fireEvent.click(screen.getByTestId('system-node-title'));
    expect(screen.getByTestId('system-node-title')).toHaveAttribute('data-selected', 'true');
    fireEvent.click(screen.getByTestId('decompose-unassign'));
    expect(document.querySelectorAll('[data-region="header"]')).toHaveLength(0);
    expect(screen.getByTestId('system-node-title')).not.toHaveAttribute('data-selected');
    expect(screen.getByTestId('decompose-verify')).toBeDisabled();
  });
});
