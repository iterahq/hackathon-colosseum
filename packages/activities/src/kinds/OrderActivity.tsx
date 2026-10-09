/**
 * Order — reorder a scrambled sequence into `correct_order` (plan: ≈ "unscramble").
 * Reorder by dragging the row (framer-motion `Reorder`: the grip on touch, the
 * whole row with a mouse). Submit compares the current order to `correct_order`.
 * Reuses InstructionPanel + `onComplete(correct)`.
 *
 * NO story-only seams (ADR-4): answered/correct/incorrect are reached by dragging
 * items, from the story's own `play`. `priorAnswer`
 * replays the SEQUENCE this activity handed up earlier — only ever a real
 * permutation of the authored items — and the position colors are re-derived
 * from it exactly as they are after a live submit
 * (see `../internal/priorAnswer.ts`).
 *
 * Three properties this kind is easy to get wrong, all fixed together:
 *   • the initial arrangement is per-learner but NEVER the solution — otherwise
 *     the shuffle occasionally deals an acerto for zero work (`learnerShuffle`);
 *   • submitting requires having MOVED something: the list arrives populated, so
 *     "there is a sequence on screen" is not a composed answer;
 *   • after submit the rows are LOCKED, never unmounted — the learner keeps
 *     looking at the arrangement they are being graded on.
 */
import { useState } from 'react';
import { Reorder } from 'framer-motion';
import { ListOrdered } from 'lucide-react';
import { useActivityI18n, useActivitySound } from '../context.js';
import type { ChoiceOption, OrderSpec } from '../specs.js';
import { learnerShuffleAvoidingSolution } from '../internal/shuffle.js';
import { useLearnerScope } from '../internal/useLearnerScope.js';
import {
  useActivityActionRecorder,
  type ArrangementAction,
} from '../internal/actionRecorder.js';
import { answerMachine } from '../internal/answerMachine.js';
import { priorOrder } from '../internal/priorAnswer.js';

import { InstructionPanel } from '../components/InstructionPanel.js';
import { ActivityShell, AnswerExplanation, answerExplanationText, SubmitButton } from '../components/parts.js';
import { OrderRow } from '../components/OrderRow.js';
import { useOrderDrag } from '../components/useOrderDrag.js';
import type { ActivityCompletion, PortableActivity } from '../renderer.js';
import { TOUCH_SURFACE } from '../components/touchSurface.js';

export function OrderActivity({
  activity,
  onComplete,
  reveal = false,
  priorAnswer,
}: {
  activity: PortableActivity;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
  reveal?: boolean;
  priorAnswer?: ActivityCompletion;
}) {
  const { t, locale } = useActivityI18n();
  // The learner half of the shuffle seed, injected by the host (ADR-3):
  // it used to be read straight out of the Player's localStorage.
  const scope = useLearnerScope();
  const spec = activity.spec as unknown as OrderSpec;
  const items = spec?.items ?? [];
  const correctOrder = spec?.correct_order ?? [];
  const byId = (id: string): ChoiceOption | undefined => items.find((i) => i.id === id);

  // Per-LEARNER, per-ACTIVITY arrangement (stable across remounts, different
  // between learners) that is GUARANTEED not to already be `correct_order` —
  // otherwise the shuffle can hand out a free acerto. See
  // ../internal/shuffle.ts.
  // The learner's own earlier arrangement, replayed. Accepted only as a real
  // PERMUTATION of the authored items (../internal/priorAnswer.ts): a sequence
  // missing an item is not a screen this kind can draw.
  const [restoredOrder] = useState<string[] | null>(
    () => priorOrder(priorAnswer, items.map((i) => i.id)) ?? null,
  );
  const [order, setOrder] = useState<string[]>(
    () =>
      restoredOrder ??
      learnerShuffleAvoidingSolution(items.map((i) => i.id), scope, activity.id, correctOrder),
  );
  const [submitted, setSubmitted] = useState(false);
  // The list is pre-populated by the shuffle, so "there is a sequence on screen"
  // is NOT evidence the learner composed one. Submitting requires having moved
  // at least one item — the same bar every other graded kind already sets.
  //
  // A REPLAYED sequence starts `touched`, and that is not a shortcut past the
  // bar: it is the record that the learner already cleared it, in the session
  // where they moved the items and pressed Enviar.
  const [touched, setTouched] = useState(restoredOrder !== null);

  // Grading is the KIND's job; when the verdict may reach the screen is the
  // machine's (../internal/answerMachine.ts — one definition, six call sites).
  const isOrderCorrect = order.length === correctOrder.length && order.every((id, i) => id === correctOrder[i]);
  const m = answerMachine({
    done: activity.status === 'done',
    submitted,
    reveal,
    restored: restoredOrder !== null,
    correct: isOrderCorrect,
    hasAnswer: touched,
  });
  const { locked, shown } = m;
  // Reveal without a submission shows the ANSWER KEY (the correct sequence),
  // not the learner's untouched shuffle graded red.
  const displayOrder = m.showKey ? correctOrder : order;

  // The `arrangement` family's action sequence (sub-plan 1, Fase A).
  const trace = useActivityActionRecorder<ArrangementAction>(activity.id);

  const cue = useActivitySound();

  function recordMove(itemId: string, from: number, to: number) {
    cue('drop');
    trace.record('item_moved', { item_id: itemId, from, to, via: 'drag' });
    setTouched(true);
  }

  // Only the DROP of a drag counts as a move (see useOrderDrag).
  const drag = useOrderDrag({
    order,
    locked,
    setOrder,
    onDrop: recordMove,
  });

  // ONE-STEP: "Enviar" grades AND completes in the same click. Grade off the
  // CURRENT order (the machine's `gradeResult` isn't set yet at click time).
  function handleSubmit() {
    if (!m.acceptsSubmit) return;
    setSubmitted(true);
    // Hand the settled sequence up as text (dropped unless the author opted in).
    const sequence = order.map((id, i) => `${i + 1}. ${byId(id)?.label ?? id}`).join('\n');
    trace.record('answer_submitted', { order: [...order] });
    onComplete(isOrderCorrect, {
      response: sequence,
      actions: trace.drain(),
      explanation: answerExplanationText(activity.spec, locale, isOrderCorrect),
    });
  }

  return (
    <ActivityShell kind="order" icon={ListOrdered} label={t('activity.order')}>
      <InstructionPanel spec={spec?.instruction} />
      <p className="mt-4 text-xs font-mono uppercase tracking-wider text-muted-foreground">
        {t('activity.orderHint')}
      </p>

      <Reorder.Group
        as="ol"
        axis="y"
        values={displayOrder}
        onReorder={drag.onReorder}
        className={`mt-3 space-y-2.5 ${TOUCH_SURFACE}`}
        data-testid="order-list"
      >
        {displayOrder.map((id, idx) => {
          const verdict = !shown ? null : correctOrder[idx] === id ? 'right' : 'miss';
          return (
            <OrderRow
              key={id}
              id={id}
              option={byId(id)}
              position={idx}
              locked={locked}
              verdict={verdict}
              onDragStart={() => {
                if (!locked) cue('pick');
                drag.onDragStart(id);
              }}
              onDragEnd={drag.onDragEnd}
            />
          );
        })}
      </Reorder.Group>
      {order.length === 0 && <p className="mt-3 text-sm text-muted-foreground">{t('activity.noItems')}</p>}

      <AnswerExplanation spec={activity.spec} shown={m.shown} correct={m.gradeResult} handedUp={submitted} />

      <SubmitButton
        submitted={m.submitLocked}
        correct={m.gradeResult}
        disabled={m.submitDisabled}
        onSubmit={handleSubmit}
        testId="order-submit"
      />
    </ActivityShell>
  );
}
