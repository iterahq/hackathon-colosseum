/**
 * Order — reorder a scrambled sequence into `correct_order` (plan: ≈ "unscramble").
 * Reorder via native drag (grip handle) OR the up/down buttons (keyboard/touch
 * accessible). Submit compares the current order to `correct_order`. Reuses
 * InstructionPanel + `onComplete(correct)`.
 *
 * NO story-only seams (ADR-4): answered/correct/incorrect are reached by moving
 * items with the up/down controls, from the story's own `play`.
 *
 * Three properties this kind is easy to get wrong, all fixed together:
 *   • the initial arrangement is per-learner but NEVER the solution — otherwise
 *     the shuffle occasionally deals an acerto for zero work (`learnerShuffle`);
 *   • submitting requires having MOVED something: the list arrives populated, so
 *     "there is a sequence on screen" is not a composed answer;
 *   • after submit the reorder controls are DISABLED, never unmounted — the
 *     learner keeps looking at the arrangement they are being graded on.
 */
import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, GripVertical, ListOrdered, XCircle } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Activity, ChoiceOption, OrderSpec } from '@/types/content';
import { learnerShuffleAvoidingSolution } from '@/utils/learnerShuffle';
import { answerMachine } from '@/utils/answerMachine';
import { useActionRecorder } from '@/hooks/useActionRecorder';
import { InstructionPanel } from './InstructionPanel';
import { ActivityShell, AnswerExplanation, SubmitButton } from './parts';
import type { ActivityCompleteDetail } from './activityFeedbackKinds';

export function OrderActivity({
  activity,
  onComplete,
  reveal = false,
}: {
  activity: Activity;
  onComplete: (correct: boolean, detail?: ActivityCompleteDetail) => void;
  reveal?: boolean;
}) {
  const { t } = useI18n();
  const spec = activity.spec as unknown as OrderSpec;
  const items = spec?.items ?? [];
  const correctOrder = spec?.correct_order ?? [];
  const byId = (id: string): ChoiceOption | undefined => items.find((i) => i.id === id);

  // Per-LEARNER, per-ACTIVITY arrangement (stable across remounts, different
  // between learners) that is GUARANTEED not to already be `correct_order` —
  // otherwise the shuffle can hand out a free acerto. See
  // src/utils/learnerShuffle.ts.
  const [order, setOrder] = useState<string[]>(() =>
    learnerShuffleAvoidingSolution(items.map((i) => i.id), activity.id, correctOrder),
  );
  const [submitted, setSubmitted] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // The list is pre-populated by the shuffle, so "there is a sequence on screen"
  // is NOT evidence the learner composed one. Submitting requires having moved
  // at least one item — the same bar every other graded kind already sets.
  const [touched, setTouched] = useState(false);

  // Grading is the KIND's job; when the verdict may reach the screen is the
  // machine's (src/utils/answerMachine.ts — one definition, six call sites).
  const isOrderCorrect = order.length === correctOrder.length && order.every((id, i) => id === correctOrder[i]);
  const m = answerMachine({
    done: activity.status === 'done',
    submitted,
    reveal,
    correct: isOrderCorrect,
    hasAnswer: touched,
  });
  const { locked, shown } = m;
  // Reveal without a submission shows the ANSWER KEY (the correct sequence),
  // not the learner's untouched shuffle graded red.
  const displayOrder = m.showKey ? correctOrder : order;

  // The `arrangement` family's action sequence (sub-plan 1, Fase A).
  const trace = useActionRecorder('arrangement', activity.id);

  function move(from: number, to: number, via: 'drag' | 'button' = 'button') {
    if (locked || to < 0 || to >= order.length) return;
    // AFTER the guard, so a no-op nudge at the top of the list is not recorded
    // as a move the learner never made; BEFORE the setState, so the updater
    // stays free of side effects (StrictMode double-invokes it in dev).
    // `via` separates the learner who dragged from the learner on a phone using
    // the arrows — same permutation, different interaction cost.
    trace.record('item_moved', { item_id: order[from], from, to, via });
    setTouched(true);
    setOrder((prev) => {
      const next = [...prev];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return next;
    });
  }

  // ONE-STEP: "Enviar" grades AND completes in the same click. Grade off the
  // CURRENT order (the machine's `gradeResult` isn't set yet at click time).
  function handleSubmit() {
    if (!m.acceptsSubmit) return;
    setSubmitted(true);
    // Hand the settled sequence up as text (dropped unless the author opted in).
    const sequence = order.map((id, i) => `${i + 1}. ${byId(id)?.label ?? id}`).join('\n');
    trace.record('answer_submitted', { order: [...order] });
    onComplete(isOrderCorrect, { response: sequence, actions: trace.drain() });
  }

  return (
    <ActivityShell kind="order" icon={ListOrdered} label={t('activity.order')}>
      <InstructionPanel spec={spec?.instruction} />
      <p className="mt-4 text-xs font-mono uppercase tracking-wider text-muted-foreground">
        {t('activity.orderHint')}
      </p>

      <ol className="mt-3 space-y-2.5" data-testid="order-list">
        {displayOrder.map((id, idx) => {
          const o = byId(id);
          const posCorrect = shown && correctOrder[idx] === id;
          const posWrong = shown && correctOrder[idx] !== id;
          return (
            <li
              key={id}
              draggable={!locked}
              onDragStart={() => setDragIndex(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== idx) move(dragIndex, idx, 'drag');
                setDragIndex(null);
              }}
              data-testid="order-item"
              // The AUTHORED item id — what `correct_order` is keyed on. The
              // rendered position is per-learner and changes as they reorder.
              data-option-id={id}
              data-position={idx}
              className={`flex items-center gap-3 py-3 px-4 rounded-2xl border transition-colors ${
                posCorrect
                  ? 'border-verde-tech bg-verde-tech/10'
                  : posWrong
                    ? 'border-destructive bg-destructive/10'
                    : 'border-border bg-card'
              } ${locked ? '' : 'cursor-grab active:cursor-grabbing'}`}
            >
              {/* Kept mounted when locked (dimmed) so the row keeps the exact
                  geometry the learner was looking at when they submitted. */}
              <GripVertical
                className={`w-4 h-4 text-muted-foreground flex-shrink-0 ${locked ? 'opacity-30' : ''}`}
                aria-hidden
              />
              <span className="font-mono text-xs text-menta w-5 flex-shrink-0">{idx + 1}</span>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {o?.image_url && (
                  <img src={o.image_url} alt={o.label ?? id} className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
                )}
                {o?.label && <span className="flex-1 min-w-0 break-words">{o.label}</span>}
                {o?.audio_url && <audio src={o.audio_url} controls className="h-7 max-w-[8rem]" />}
              </div>
              {posCorrect && <CheckCircle2 className="w-4 h-4 text-menta flex-shrink-0" />}
              {posWrong && <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />}
              {/* DISABLED, never unmounted. Removing the controls after a
                  submit deletes the learner's own reference for what they
                  arranged; a disabled control still says "this is the thing you
                  used, and it is closed now". */}
              <span className="flex flex-col flex-shrink-0">
                <button
                  onClick={() => move(idx, idx - 1)}
                  disabled={locked || idx === 0}
                  data-testid="order-up"
                  aria-label={t('activity.moveUp')}
                  className="text-muted-foreground hover:text-menta disabled:opacity-30 disabled:hover:text-muted-foreground"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => move(idx, idx + 1)}
                  disabled={locked || idx === displayOrder.length - 1}
                  data-testid="order-down"
                  aria-label={t('activity.moveDown')}
                  className="text-muted-foreground hover:text-menta disabled:opacity-30 disabled:hover:text-muted-foreground"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </span>
            </li>
          );
        })}
        {order.length === 0 && <p className="text-sm text-muted-foreground">{t('activity.noItems')}</p>}
      </ol>

      <AnswerExplanation spec={activity.spec} shown={m.shown} correct={m.gradeResult} />

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
