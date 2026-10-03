import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { SingleChoiceActivity } from '@/components/branded/activity/SingleChoiceActivity';
import { MultiChoiceActivity } from '@/components/branded/activity/MultiChoiceActivity';
import { OrderActivity } from '@/components/branded/activity/OrderActivity';
import { MatchActivity } from '@/components/branded/activity/MatchActivity';
import type { Activity } from '@/types/content';
import type { ActivityCompleteDetail } from '@/components/branded/activity/activityFeedbackKinds';
import { FAMILY_EMITTED, isActionOfFamily, type ActivityFamily } from '@/utils/activityFamilies';
import type { RecordedAction } from '@/utils/learningTrace';

/**
 * The BEHAVIOURAL half of the Fase A guard.
 *
 * `activityFamilies.test.ts` proves the registry is internally consistent.
 * That is not the same as proving the components obey it — a registry can be
 * perfectly coherent about a vocabulary nobody emits, which is exactly the
 * two-action trace this sub-plan exists to end.
 *
 * So these tests DRIVE each wired kind through the DOM the way a learner would
 * and assert the sequence handed up in `onComplete(correct, { actions })`:
 *
 *   • the sequence is non-empty and chronologically ordered;
 *   • every action belongs to the kind's own family;
 *   • the "changed my mind" path is visible in it — which is the entire reason
 *     a sequence beats a boolean, and the thing a smoke test would miss;
 *   • timestamps are WALL CLOCK, because the rebase to offsets happens later,
 *     in `buildAttemptTrace`, and an activity that emitted offsets would be
 *     quietly wrong by however long the learner spent on the previous screen.
 *
 * ⚠️ These are components, not the persistence path. Nothing here writes, and
 * that is the boundary the author harness depends on.
 */

function makeActivity(kind: Activity['kind'], spec: Record<string, unknown>): Activity {
  return { id: `t-${kind}`, lessonId: 'l', ordinal: 0, kind, spec, rubric: null };
}

/** Capture the `detail` of the single `onComplete` call. */
function captor() {
  const calls: ActivityCompleteDetail[] = [];
  const fn = vi.fn((_correct: boolean, detail?: ActivityCompleteDetail) => {
    calls.push(detail ?? {});
  });
  return {
    fn,
    actions: () => (calls[0]?.actions ?? []) as readonly RecordedAction[],
  };
}

/** The invariants every wired family owes, regardless of kind. */
function assertFamilyContract(family: ActivityFamily, actions: readonly RecordedAction[]) {
  expect(actions.length).toBeGreaterThan(0);
  for (const a of actions) {
    expect(isActionOfFamily(family, a.type)).toBe(true);
    // Wall clock, not an offset. A `Date.now()` is >= 1e12; an offset from the
    // activity's origin is a handful of thousands. This assertion is what stops
    // someone "simplifying" the recorder into emitting offsets it cannot know.
    expect(a.at).toBeGreaterThan(1_000_000_000_000);
  }
  // Chronological by construction — replay depends on it, and the DB has no
  // constraint that would catch a scrambled array.
  const times = actions.map((a) => a.at);
  expect([...times].sort((x, y) => x - y)).toEqual(times);
  // Every emitted type must be declared as emitted for that family, or the
  // ledger in `FAMILY_EMITTED` is lying about what production writes.
  const declared = FAMILY_EMITTED[family] as readonly string[];
  for (const a of actions) expect(declared).toContain(a.type);
  // The submit is always the last thing that happened.
  expect(actions.at(-1)?.type).toBe('answer_submitted');
}

describe('selection family — single_choice', () => {
  const SPEC = {
    options: [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
    ],
    correct_option_id: 'a',
  };

  it('records every pick, including the one the learner abandoned', () => {
    const cap = captor();
    render(
      <I18nProvider>
        <SingleChoiceActivity activity={makeActivity('single_choice', SPEC)} onComplete={cap.fn} />
      </I18nProvider>
    );
    // Picks Beta, changes their mind, submits Alpha. The attempt row will say
    // "passed"; only the trace says they nearly did not.
    fireEvent.click(screen.getByText('Beta'));
    fireEvent.click(screen.getByText('Alpha'));
    fireEvent.click(screen.getByTestId('single-choice-submit'));

    const actions = cap.actions();
    assertFamilyContract('selection', actions);
    expect(actions.map((a) => a.type)).toEqual([
      'option_selected',
      'option_selected',
      'answer_submitted',
    ]);
    // The AUTHORED ids, not the post-shuffle positions — the shuffle is
    // per-learner, so positions are not comparable across learners.
    expect(actions[0].payload).toEqual({ option_id: 'b' });
    expect(actions[1].payload).toEqual({ option_id: 'a' });
    expect(actions[2].payload).toEqual({ option_ids: ['a'] });
  });
});

describe('selection family — multi_choice', () => {
  const SPEC = {
    options: [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
    ],
    correct_option_ids: ['a', 'b'],
  };

  it('distinguishes selecting from DE-selecting — a bare "selected" would flatten it', () => {
    const cap = captor();
    render(
      <I18nProvider>
        <MultiChoiceActivity activity={makeActivity('multi_choice', SPEC)} onComplete={cap.fn} />
      </I18nProvider>
    );
    fireEvent.click(screen.getByText('Alpha'));
    fireEvent.click(screen.getByText('Gamma'));
    fireEvent.click(screen.getByText('Gamma')); // took it back
    fireEvent.click(screen.getByText('Beta'));
    fireEvent.click(screen.getByTestId('multi-choice-submit'));

    const actions = cap.actions();
    assertFamilyContract('selection', actions);
    expect(actions.map((a) => a.type)).toEqual([
      'option_selected',
      'option_selected',
      'option_deselected',
      'option_selected',
      'answer_submitted',
    ]);
    expect(actions[2].payload).toEqual({ option_id: 'c' });
    // Click order, not spec order — the deterministic record of what they did.
    expect(actions[4].payload).toEqual({ option_ids: ['a', 'b'] });
  });
});

describe('arrangement family — order', () => {
  const SPEC = {
    items: [
      { id: 'i1', label: 'One' },
      { id: 'i2', label: 'Two' },
      { id: 'i3', label: 'Three' },
    ],
    correct_order: ['i1', 'i2', 'i3'],
  };

  function renderOrder() {
    const cap = captor();
    render(
      <I18nProvider>
        <OrderActivity activity={makeActivity('order', SPEC)} onComplete={cap.fn} />
      </I18nProvider>
    );
    return cap;
  }

  it('records each move with the item, both positions, and HOW it was moved', () => {
    const cap = renderOrder();
    // The AUTHORED id of whatever the per-learner shuffle put in row 2 — read
    // from the DOM rather than assumed, because the arrangement is seeded from
    // the activity id and is deliberately never the solution.
    const movedId = screen.getAllByTestId('order-item')[1].getAttribute('data-option-id');
    fireEvent.click(screen.getAllByTestId('order-up')[1]); // row 2 moves up
    fireEvent.click(screen.getByTestId('order-submit'));

    const actions = cap.actions();
    assertFamilyContract('arrangement', actions);
    expect(actions.map((a) => a.type)).toEqual(['item_moved', 'answer_submitted']);
    expect(actions[0].payload).toEqual({ item_id: movedId, from: 1, to: 0, via: 'button' });
    // The submitted permutation is the arrangement, by id — replaying the moves
    // against the seeded start has to land on exactly this.
    expect(actions[1].payload).toEqual({
      order: screen.getAllByTestId('order-item').map((el) => el.getAttribute('data-option-id')),
    });
  });

  // Native HTML5 drag is gone (the rows use framer's `Reorder`, which needs real
  // layout and so cannot be driven in jsdom). The `via: 'drag'` half — one
  // `item_moved` per completed drag — is proven where the drop bookkeeping
  // lives, in `useOrderDrag.test.ts`. What is reachable here is the other side
  // of the contrast: an arrow tap is recorded as `via: 'button'`.
  it('records an arrow tap as via button, the half that contrasts with a drag', () => {
    const cap = renderOrder();
    const before = screen.getAllByTestId('order-item').map((r) => r.getAttribute('data-option-id'));
    fireEvent.click(screen.getAllByTestId('order-up')[2]);
    fireEvent.click(screen.getByTestId('order-submit'));

    const actions = cap.actions();
    assertFamilyContract('arrangement', actions);
    expect(actions[0].type).toBe('item_moved');
    expect(actions[0].payload).toMatchObject({ item_id: before[2], from: 2, to: 1, via: 'button' });
    expect(actions.filter((a) => a.type === 'item_moved')).toHaveLength(1);
  });
});

describe('arrangement family — match', () => {
  const SPEC = {
    left: [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
    ],
    right: [
      { id: 'ra', label: 'DefA' },
      { id: 'rb', label: 'DefB' },
    ],
    pairs: [
      { left_id: 'a', right_id: 'ra' },
      { left_id: 'b', right_id: 'rb' },
    ],
  };

  const card = (label: string) => screen.getByText(label).closest('button') as HTMLButtonElement;

  it('records arm → pair → break → re-pair, which is the whole story of a match attempt', () => {
    const cap = captor();
    render(
      <I18nProvider>
        <MatchActivity activity={makeActivity('match', SPEC)} onComplete={cap.fn} />
      </I18nProvider>
    );
    fireEvent.click(card('Alpha'));
    fireEvent.click(card('DefB')); // wrong pair, on purpose
    fireEvent.click(card('Alpha')); // undo it
    fireEvent.click(card('Alpha'));
    fireEvent.click(card('DefA'));
    fireEvent.click(card('Beta'));
    fireEvent.click(card('DefB'));
    fireEvent.click(screen.getByTestId('match-submit'));

    const actions = cap.actions();
    assertFamilyContract('arrangement', actions);
    expect(actions.map((a) => a.type)).toEqual([
      'pair_armed',
      'pair_made',
      'pair_broken',
      'pair_armed',
      'pair_made',
      'pair_armed',
      'pair_made',
      'answer_submitted',
    ]);
    expect(actions[1].payload).toEqual({ left_id: 'a', right_id: 'rb' });
    expect(actions[2].payload).toEqual({ left_id: 'a', right_id: 'rb' });
    expect(actions[7].payload).toEqual({
      pairs: [
        ['a', 'ra'],
        ['b', 'rb'],
      ],
    });
  });
});
