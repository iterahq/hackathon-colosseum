/**
 * Order — reorder a scrambled sequence into `correct_order` (plan: ≈ "unscramble").
 * Reorder via native drag (grip handle) OR the up/down buttons (keyboard/touch
 * accessible). Submit compares the current order to `correct_order`. Reuses
 * InstructionPanel + `onComplete(correct)`.
 *
 * `initial*` props are story-only hooks for the answered/correct/incorrect states.
 */
import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, GripVertical, ListOrdered, XCircle } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Activity, ChoiceOption, OrderSpec } from '@/types/content';
import { seededShuffle } from '@/utils/seededShuffle';
import { answerMachine } from '@/utils/answerMachine';
import { InstructionPanel } from './InstructionPanel';
import { ActivityShell, SubmitButton } from './parts';

export function OrderActivity({
  activity,
  onComplete,
  reveal = false,
  initialOrder,
  initialSubmitted = false,
}: {
  activity: Activity;
  onComplete: (correct: boolean) => void;
  reveal?: boolean;
  initialOrder?: string[];
  initialSubmitted?: boolean;
}) {
  const { t } = useI18n();
  const spec = activity.spec as unknown as OrderSpec;
  const items = spec?.items ?? [];
  const correctOrder = spec?.correct_order ?? [];
  const byId = (id: string): ChoiceOption | undefined => items.find((i) => i.id === id);

  const [order, setOrder] = useState<string[]>(
    () => initialOrder ?? seededShuffle(items, Math.random().toString(36)).map((i) => i.id),
  );
  const [submitted, setSubmitted] = useState(initialSubmitted);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Grading is the KIND's job; when the verdict may reach the screen is the
  // machine's (src/utils/answerMachine.ts — one definition, six call sites).
  const isOrderCorrect = order.length === correctOrder.length && order.every((id, i) => id === correctOrder[i]);
  const m = answerMachine({
    done: activity.status === 'done',
    submitted,
    reveal,
    correct: isOrderCorrect,
    hasAnswer: order.length > 0,
  });
  const { locked, shown } = m;
  // Reveal without a submission shows the ANSWER KEY (the correct sequence),
  // not the learner's untouched shuffle graded red.
  const displayOrder = m.showKey ? correctOrder : order;

  function move(from: number, to: number) {
    if (locked || to < 0 || to >= order.length) return;
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
    onComplete(isOrderCorrect);
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
                if (dragIndex !== null && dragIndex !== idx) move(dragIndex, idx);
                setDragIndex(null);
              }}
              data-testid="order-item"
              data-position={idx}
              className={`flex items-center gap-3 py-3 px-4 rounded-2xl border transition-colors ${
                posCorrect
                  ? 'border-verde-tech bg-verde-tech/10'
                  : posWrong
                    ? 'border-destructive bg-destructive/10'
                    : 'border-border bg-card'
              } ${locked ? '' : 'cursor-grab active:cursor-grabbing'}`}
            >
              {!locked && <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
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
              {!locked && (
                <span className="flex flex-col flex-shrink-0">
                  <button
                    onClick={() => move(idx, idx - 1)}
                    disabled={idx === 0}
                    data-testid="order-up"
                    aria-label={t('activity.moveUp')}
                    className="text-muted-foreground hover:text-menta disabled:opacity-30"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => move(idx, idx + 1)}
                    disabled={idx === order.length - 1}
                    data-testid="order-down"
                    aria-label={t('activity.moveDown')}
                    className="text-muted-foreground hover:text-menta disabled:opacity-30"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </span>
              )}
            </li>
          );
        })}
        {order.length === 0 && <p className="text-sm text-muted-foreground">{t('activity.noItems')}</p>}
      </ol>

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
