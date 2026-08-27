/**
 * @vitest-environment node
 *
 * The REPLAY DECODER, and the ADR-4 floor it enforces.
 *
 * Co-located rather than in `src/test/` because `priorAnswer.ts` is deliberately
 * NOT exported from the barrel: it is how the kinds read a persisted answer, not
 * a promise to consumers. The vitest config admits co-located tests under each
 * workspace package's `src` for exactly this case.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS BEING PINNED
 * ─────────────────────────────────────────────────────────────────────────────
 * Plan `20260728-itera-activity-testing`, ADR-4: *a state reachable by a prop
 * but not by a real user is a false green.* `priorAnswer` is a prop, so the
 * burden is on it. The decoder is where that burden is discharged, and these
 * are the four properties that discharge it:
 *
 *  1. **A verdict cannot be handed in.** The payload type is
 *     `ActivityCompletion`, which has no `correct` field. Nothing below can
 *     return one — the readers return SELECTIONS, and the kind re-grades.
 *  2. **A bare boolean restores nothing.** Neither does `{}`, nor a
 *     `response` string, nor a trace that never reached `answer_submitted`.
 *  3. **Only the spec's own vocabulary is accepted.** An id no author wrote
 *     drops the whole payload.
 *  4. **Only shapes the interaction can produce are accepted.** A duplicate
 *     pick, a partial arrangement, a card paired twice — each one is a screen
 *     the clicking path cannot reach, so the replay path must not reach it
 *     either.
 */
import { describe, it, expect } from 'vitest';
import { priorOptionIds, priorOrder, priorPairs } from './priorAnswer.js';
import type { ActivityCompletion } from '../renderer.js';

const OPTIONS = ['a', 'b', 'c'] as const;
const LEFT = ['l1', 'l2'] as const;
const RIGHT = ['r1', 'r2'] as const;

/** The exact shape `handleSubmit` records, so the fixtures cannot drift from it. */
const submitted = (payload: Record<string, unknown>): ActivityCompletion => ({
  actions: [
    { type: 'option_selected', at: 1, payload: { option_id: 'a' } },
    { type: 'answer_submitted', at: 2, payload },
  ],
});

describe('priorOptionIds — single_choice / multi_choice', () => {
  it('restores the ids the learner submitted, in the order they were recorded', () => {
    expect(priorOptionIds(submitted({ option_ids: ['c', 'a'] }), OPTIONS)).toEqual(['c', 'a']);
  });

  it('restores a single pick', () => {
    expect(priorOptionIds(submitted({ option_ids: ['b'] }), OPTIONS)).toEqual(['b']);
  });

  /* ── the ADR-4 floor ──────────────────────────────────────────────────── */

  it('restores NOTHING from an absent payload', () => {
    expect(priorOptionIds(undefined, OPTIONS)).toBeUndefined();
  });

  it('restores NOTHING from an empty completion — the "pretend it happened" case', () => {
    expect(priorOptionIds({}, OPTIONS)).toBeUndefined();
  });

  it('restores NOTHING from a completion that carries only prose', () => {
    // `response` and `message` are the human-readable halves. They are built
    // from authored LABELS, which are localized and editable, so they can never
    // be keyed back to an option — and a decoder that tried would be inventing.
    expect(
      priorOptionIds({ response: 'Beta', message: 'Você acertou!', explanation: '…' }, OPTIONS),
    ).toBeUndefined();
  });

  it('restores NOTHING from an UNFINISHED attempt', () => {
    // The learner clicked around and left. There is a trace, but no answer.
    const abandoned: ActivityCompletion = {
      actions: [
        { type: 'option_selected', at: 1, payload: { option_id: 'a' } },
        { type: 'option_deselected', at: 2, payload: { option_id: 'a' } },
      ],
    };
    expect(priorOptionIds(abandoned, OPTIONS)).toBeUndefined();
  });

  it('restores NOTHING when an id is not in the spec', () => {
    expect(priorOptionIds(submitted({ option_ids: ['a', 'ghost'] }), OPTIONS)).toBeUndefined();
    // …and it drops the WHOLE payload, not just the stranger. A partial restore
    // would paint a verdict over a selection with no visible owner.
    expect(priorOptionIds(submitted({ option_ids: ['ghost'] }), OPTIONS)).toBeUndefined();
  });

  it('restores NOTHING from an empty selection — no kind can submit one', () => {
    expect(priorOptionIds(submitted({ option_ids: [] }), OPTIONS)).toBeUndefined();
  });

  it('restores NOTHING from a duplicated pick — the UI cannot produce one', () => {
    expect(priorOptionIds(submitted({ option_ids: ['a', 'a'] }), OPTIONS)).toBeUndefined();
  });

  it('restores NOTHING from a malformed payload', () => {
    expect(priorOptionIds(submitted({ option_ids: 'a' }), OPTIONS)).toBeUndefined();
    expect(priorOptionIds(submitted({ option_ids: [1, 2] }), OPTIONS)).toBeUndefined();
    expect(priorOptionIds(submitted({}), OPTIONS)).toBeUndefined();
    expect(priorOptionIds({ actions: [{ type: 'answer_submitted', at: 1 }] }, OPTIONS)).toBeUndefined();
  });

  it('reads the LAST settled answer when a host concatenated two attempts', () => {
    const twice: ActivityCompletion = {
      actions: [
        { type: 'answer_submitted', at: 1, payload: { option_ids: ['a'] } },
        { type: 'answer_submitted', at: 2, payload: { option_ids: ['b'] } },
      ],
    };
    expect(priorOptionIds(twice, OPTIONS)).toEqual(['b']);
  });
});

describe('priorOrder — order', () => {
  const ITEMS = ['i1', 'i2', 'i3'] as const;

  it('restores the sequence the learner submitted', () => {
    expect(priorOrder(submitted({ order: ['i3', 'i1', 'i2'] }), ITEMS)).toEqual(['i3', 'i1', 'i2']);
  });

  it('restores NOTHING from a PARTIAL arrangement', () => {
    // Every item is always on the list; only the positions move. A short
    // sequence is not a screen this kind can draw.
    expect(priorOrder(submitted({ order: ['i1', 'i2'] }), ITEMS)).toBeUndefined();
  });

  it('restores NOTHING when an item is duplicated or unknown', () => {
    expect(priorOrder(submitted({ order: ['i1', 'i1', 'i2'] }), ITEMS)).toBeUndefined();
    expect(priorOrder(submitted({ order: ['i1', 'i2', 'ghost'] }), ITEMS)).toBeUndefined();
  });

  it('restores NOTHING from an empty completion or an unfinished attempt', () => {
    expect(priorOrder({}, ITEMS)).toBeUndefined();
    expect(priorOrder({ actions: [{ type: 'item_moved', at: 1 }] }, ITEMS)).toBeUndefined();
  });
});

describe('priorPairs — match', () => {
  it('restores the pairing in CREATION order — the order that numbers the badges', () => {
    expect(
      priorPairs(submitted({ pairs: [['l2', 'r2'], ['l1', 'r1']] }), LEFT, RIGHT),
    ).toEqual([
      { left_id: 'l2', right_id: 'r2' },
      { left_id: 'l1', right_id: 'r1' },
    ]);
  });

  it('accepts a PARTIAL pairing — a learner really can submit fewer pairs', () => {
    // Unlike `order`, this kind starts empty and the learner builds up. A
    // half-finished pairing is a screen the taps can produce, so the replay
    // must be able to produce it too.
    expect(priorPairs(submitted({ pairs: [['l1', 'r1']] }), LEFT, RIGHT)).toEqual([
      { left_id: 'l1', right_id: 'r1' },
    ]);
  });

  it('restores NOTHING when a card is paired twice — the taps cannot do that', () => {
    expect(priorPairs(submitted({ pairs: [['l1', 'r1'], ['l1', 'r2']] }), LEFT, RIGHT)).toBeUndefined();
    expect(priorPairs(submitted({ pairs: [['l1', 'r1'], ['l2', 'r1']] }), LEFT, RIGHT)).toBeUndefined();
  });

  it('restores NOTHING when a side is crossed or unknown', () => {
    // `r1` is a RIGHT card; naming it on the left is not a pairing anyone made.
    expect(priorPairs(submitted({ pairs: [['r1', 'l1']] }), LEFT, RIGHT)).toBeUndefined();
    expect(priorPairs(submitted({ pairs: [['l1', 'ghost']] }), LEFT, RIGHT)).toBeUndefined();
  });

  it('restores NOTHING from a malformed or empty payload', () => {
    expect(priorPairs(submitted({ pairs: [] }), LEFT, RIGHT)).toBeUndefined();
    expect(priorPairs(submitted({ pairs: [['l1']] }), LEFT, RIGHT)).toBeUndefined();
    expect(priorPairs(submitted({ pairs: ['l1-r1'] }), LEFT, RIGHT)).toBeUndefined();
    expect(priorPairs({}, LEFT, RIGHT)).toBeUndefined();
  });
});

describe('the shape of the seam itself', () => {
  it('carries no verdict — "pretend it is correct" is not expressible', () => {
    // The strongest statement this file can make, and it is a statement about
    // the TYPE rather than about a value: `ActivityCompletion` has no field a
    // host could put `correct` in, so the decoders have nothing to return it
    // from. What a host can express is a SELECTION; the kind grades it.
    const keys: Array<keyof ActivityCompletion> = [
      'message',
      'explanation',
      'artifact',
      'response',
      'actions',
    ];
    expect(keys).not.toContain('correct');
    // @ts-expect-error — a verdict is not part of the completion contract, and
    // widening it to carry one is what this test exists to prevent.
    const forged: ActivityCompletion = { correct: true };
    // Even reaching past the type gets nowhere: with no settled action there is
    // nothing to restore, so the render stays exactly what it is today.
    expect(priorOptionIds(forged, OPTIONS)).toBeUndefined();
  });
});
