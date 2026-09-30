/**
 * REPLAY — how a learner's persisted answer gets back INTO the activity that
 * produced it.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS IS NOT A STORY SEAM (plan `20260728-itera-activity-testing`, ADR-4)
 * ═══════════════════════════════════════════════════════════════════════════
 * ADR-4 says: *a state reachable by a prop but not by a real user is a false
 * green.* Every kind in this package therefore reaches "answered" by CLICKING,
 * in Storybook and in Vitest alike, and none of them takes a `submitted` prop.
 *
 * This module does not add one, and the difference is structural rather than
 * a matter of naming:
 *
 *  1. **The payload is the one the activity emitted.** `ActivityRendererProps
 *     .priorAnswer` is typed as `ActivityCompletion` — the SAME type the second
 *     argument of `onComplete(correct, detail)` already had. The contract is
 *     now symmetric: the answer goes UP through `onComplete`, and the host
 *     hands that exact value back DOWN. There is no new "restored state"
 *     descriptor to invent a state with.
 *
 *  2. **The VERDICT is not in the payload, and cannot be put there.**
 *     `ActivityCompletion` carries no `correct` field. A host replays WHAT THE
 *     LEARNER PICKED; the kind then grades it with the identical expression it
 *     uses on a live submit (`selected === spec.correct_option_id`, `sameSet`,
 *     the order comparison, `isPairCorrect`). So "pretend this is correct" is
 *     not expressible. The only way to see a green render is to replay a
 *     selection that really is correct — which is precisely the render a
 *     learner who picked it produces.
 *
 *  3. **Only ids the SPEC knows are restored.** Every reader below is handed
 *     the kind's own authored vocabulary and drops the whole payload if any id
 *     falls outside it. A forged trace naming an option that does not exist
 *     restores nothing, rather than painting a verdict onto a selection with no
 *     visible owner.
 *
 *  4. **A restore never grades a fresh activity.** `answerMachine` gates the
 *     verdict on `done && restored`, so replaying onto a `todo` row seeds the
 *     inputs and stops there. Jumping an unanswered activity to the answered
 *     state by prop remains impossible.
 *
 *  5. **Nothing that already worked changed.** With `priorAnswer` omitted every
 *     reader returns `undefined`, `restored` stays `false`, and the machine is
 *     bit-identical to what it was — asserted over the full matrix in
 *     `src/utils/answerMachine.test.ts`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE TRACE AND NOT `response`
 * ═══════════════════════════════════════════════════════════════════════════
 * `ActivityCompletion.response` is a human-readable summary ("Paris", or a
 * numbered list). It is built from authored LABELS, which are localized and
 * editable, so it cannot be keyed back to an option. The `actions` trace can:
 * its terminal `answer_submitted` action carries the AUTHORED IDS the kind
 * grades on — `option_ids`, `order`, `pairs` — and those are exactly the values
 * `handleSubmit` recorded. That is why the readers here go through the trace.
 */
import type { ActivityRecordedAction } from './actionRecorder.js';
import type { ActivityCompletion } from '../renderer.js';

/**
 * The action that closes an attempt. One name, shared by every graded family
 * (`ACTIVITY_TRACE_ACTIONS.selection` and `.arrangement` both list it).
 */
const ANSWER_SUBMITTED = 'answer_submitted';

/**
 * The LAST `answer_submitted` in the trace, or `undefined`.
 *
 * Last rather than first: a host that concatenated two attempts into one trace
 * should replay the attempt that settled the activity, not the one before it.
 * A trace with no `answer_submitted` at all is an UNFINISHED attempt — the
 * learner clicked around and left — and restores nothing.
 */
function settledAction(prior?: ActivityCompletion): ActivityRecordedAction | undefined {
  const actions = prior?.actions;
  if (!actions) return undefined;
  for (let i = actions.length - 1; i >= 0; i -= 1) {
    const a = actions[i];
    if (a && a.type === ANSWER_SUBMITTED) return a;
  }
  return undefined;
}

/** A payload field that must be an array of strings, or nothing. */
function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (!value.every((x) => typeof x === 'string')) return undefined;
  return value as string[];
}

/**
 * The option ids the learner submitted, restricted to ids the spec declares.
 *
 * Used by `single_choice` and `multi_choice`. Returns `undefined` — never `[]`
 * — when there is nothing trustworthy to restore, because an EMPTY selection is
 * not an answer any of those kinds can submit (`submitDisabled` requires one),
 * so restoring one would grade a learner on a screen they never sent.
 *
 * @param known the AUTHORED option ids, from the kind's own spec.
 */
export function priorOptionIds(
  prior: ActivityCompletion | undefined,
  known: readonly string[],
): string[] | undefined {
  const ids = stringList(settledAction(prior)?.payload?.option_ids);
  if (!ids || ids.length === 0) return undefined;
  // Unknown id ⇒ drop the WHOLE payload. A partial restore would show a verdict
  // over a selection the learner cannot see, which is worse than no restore.
  if (!ids.every((id) => known.includes(id))) return undefined;
  // A duplicate would render one option twice in `multi_choice`'s set.
  if (new Set(ids).size !== ids.length) return undefined;
  return ids;
}

/**
 * The exact sequence the learner submitted, for `order`.
 *
 * Accepted only when it is a PERMUTATION of the authored items: same length, no
 * duplicates, no strangers. An arrangement missing an item is not a screen the
 * kind can draw — every item is always on the list, only the positions move.
 */
export function priorOrder(
  prior: ActivityCompletion | undefined,
  known: readonly string[],
): string[] | undefined {
  const order = stringList(settledAction(prior)?.payload?.order);
  if (!order || order.length !== known.length) return undefined;
  if (new Set(order).size !== order.length) return undefined;
  if (!order.every((id) => known.includes(id))) return undefined;
  return order;
}

/** One restored pairing, in the shape `match` keeps its own pairs in. */
export interface PriorPair {
  left_id: string;
  right_id: string;
}

/**
 * The pairings the learner submitted, for `match`.
 *
 * The trace stores them as `[[left, right], …]` — creation order, which is what
 * numbers the badges — so that order is preserved here. Each side is checked
 * against ITS OWN column, and a card may appear only once per side: two pairs
 * sharing a left card is a screen the tap interaction cannot produce.
 */
export function priorPairs(
  prior: ActivityCompletion | undefined,
  knownLeft: readonly string[],
  knownRight: readonly string[],
): PriorPair[] | undefined {
  const raw = settledAction(prior)?.payload?.pairs;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;

  const made: PriorPair[] = [];
  const usedLeft = new Set<string>();
  const usedRight = new Set<string>();
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length !== 2) return undefined;
    const [left, right] = entry;
    if (typeof left !== 'string' || typeof right !== 'string') return undefined;
    if (!knownLeft.includes(left) || !knownRight.includes(right)) return undefined;
    if (usedLeft.has(left) || usedRight.has(right)) return undefined;
    usedLeft.add(left);
    usedRight.add(right);
    made.push({ left_id: left, right_id: right });
  }
  return made;
}

/* ───────────── `question` — the non-grading kind's two extra readers ─────── */

/**
 * Whether the person used the "Outro" escape hatch.
 *
 * Read off the boolean the kind records, with the SENTINEL inside `option_ids`
 * as the fallback. Both are written on every submit, so either alone restores
 * the flag — which matters because an adapter round-tripping through the
 * plans-app carries the sentinel (`selected_option_letters` holds `OTHER`) and
 * may not carry the boolean.
 */
export function priorOther(prior?: ActivityCompletion): boolean {
  const payload = settledAction(prior)?.payload;
  if (payload?.other === true) return true;
  const ids = stringList(payload?.option_ids);
  return ids ? ids.includes('OTHER') : false;
}

/**
 * The free text the person wrote, from `ActivityCompletion.response`.
 *
 * ⚠️ **This is the ONE reader in this module that goes to `response` instead of
 * the trace, and the header above says why the others must not.** There the
 * objection is real: `response` is a summary built from localized authored
 * LABELS ("Paris", a numbered list), so it cannot be keyed back to an option id
 * and a label edit would silently change what "restores".
 *
 * None of that holds for `question`. Its `response` is the person's OWN PROSE,
 * verbatim — nothing was summarised, no authored label is involved, and there is
 * no id to key back to because free text has none. It is also the only place the
 * text exists: the trace payload deliberately carries `has_text`, never the
 * words, under the host's `PAYLOADS_CARRY_NO_FREE_TEXT` rule.
 *
 * And the hazard the trace-only rule protects against cannot arise here at all:
 * a `question` has no verdict, so no restore of it can paint a mark nobody
 * earned. Returns `undefined` for a missing or blank response, so "wrote
 * nothing" and "wrote whitespace" both restore an empty field rather than one
 * holding invisible characters.
 */
export function priorText(prior?: ActivityCompletion): string | undefined {
  const value = prior?.response;
  if (typeof value !== 'string') return undefined;
  return value.trim().length > 0 ? value : undefined;
}

/* ───────────── scene kinds — the payload of the gesture that opened the gate ─ */

/**
 * One field of the LAST `gate_opened` action, or `undefined`.
 *
 * A scene kind has no `answer_submitted`: its attempt closes when the gesture
 * opens the gate, so that is the action a kind with learner-shaped end state
 * (`decompose_canvas`'s assignment) records it on. The value is returned raw —
 * the kind validates it against its own spec and re-judges it, per rules 2
 * and 3 above.
 */
export function priorGatePayload(prior: ActivityCompletion | undefined, key: string): unknown {
  const actions = prior?.actions;
  if (!actions) return undefined;
  for (let i = actions.length - 1; i >= 0; i -= 1) {
    const a = actions[i];
    if (a && a.type === 'gate_opened') return a.payload?.[key];
  }
  return undefined;
}
