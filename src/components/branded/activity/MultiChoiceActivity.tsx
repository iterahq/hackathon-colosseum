/**
 * MultiChoice — multiple choice, one-or-MORE correct (plan: ≈ MC v2). Toggle
 * any number of options, submit, and complete correct only when the selected
 * SET exactly equals `correct_option_ids`. Reuses the InstructionPanel + the
 * `onComplete(correct)` contract.
 *
 * `initial*` props are story-only hooks for the answered/correct/incorrect states.
 */
import { useState } from 'react';
import { Check, CheckCircle2, CheckSquare, XCircle } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Activity, ChoiceOption, MultiChoiceSpec } from '@/types/content';
import { seededShuffle } from '@/utils/seededShuffle';
import { InstructionPanel } from './InstructionPanel';
import { ActivityShell, SubmitButton } from './parts';

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

function OptionMedia({ option }: { option: ChoiceOption }) {
  return (
    <div className="flex items-start gap-3 flex-1 min-w-0">
      {option.image_url && (
        <img src={option.image_url} alt={option.label ?? option.id} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
      )}
      {option.label && <span className="flex-1 min-w-0 whitespace-normal break-words">{option.label}</span>}
      {option.audio_url && (
        <audio src={option.audio_url} controls className="h-8 max-w-[10rem]" onClick={(e) => e.stopPropagation()} />
      )}
    </div>
  );
}

export function MultiChoiceActivity({
  activity,
  onComplete,
  reveal = false,
  initialSelectedIds,
  initialSubmitted = false,
}: {
  activity: Activity;
  onComplete: (correct: boolean) => void;
  reveal?: boolean;
  initialSelectedIds?: string[];
  initialSubmitted?: boolean;
}) {
  const { t } = useI18n();
  const spec = activity.spec as unknown as MultiChoiceSpec;
  const [options] = useState(() => seededShuffle(spec?.options ?? [], Math.random().toString(36)));
  const correctIds = spec?.correct_option_ids ?? [];
  const [selected, setSelected] = useState<string[]>(initialSelectedIds ?? []);
  const [submitted, setSubmitted] = useState(initialSubmitted);
  const isDone = activity.status === 'done';
  const shown = submitted || reveal;

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // ONE-STEP: "Enviar" grades AND completes in the same click. Grade off the
  // CURRENT selection (submitted-gated `isCorrect` isn't set yet at click time).
  function handleSubmit() {
    if (submitted || isDone) return;
    setSubmitted(true);
    onComplete(sameSet(selected, correctIds));
  }

  return (
    <ActivityShell kind="multi_choice" icon={CheckSquare} label={t('activity.multiChoice')}>
      <InstructionPanel spec={spec?.instruction} />
      <p className="mt-4 text-xs font-mono uppercase tracking-wider text-muted-foreground">
        {t('activity.selectAll')}
      </p>

      <div className="mt-3 grid gap-2.5 auto-rows-fr" data-testid="multi-choice-options">
        {options.map((o) => {
          const chosen = selected.includes(o.id);
          const isCorrectOpt = correctIds.includes(o.id);
          const showCorrect = shown && isCorrectOpt;
          const showWrong = shown && chosen && !isCorrectOpt;
          return (
            <button
              key={o.id}
              disabled={submitted || isDone || reveal}
              onClick={() => toggle(o.id)}
              data-testid="multi-choice-option"
              data-selected={chosen ? 'true' : undefined}
              className={`w-full h-full flex items-start gap-3 py-4 px-5 rounded-2xl border text-left transition-colors ${
                showCorrect
                  ? 'border-verde-tech bg-verde-tech/10'
                  : showWrong
                    ? 'border-destructive bg-destructive/10'
                    : chosen
                      ? 'border-menta bg-menta/10'
                      : 'border-border bg-card hover:border-verde-tech/50 disabled:opacity-70'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
                  chosen ? 'border-menta bg-menta/20' : 'border-muted-foreground/40'
                }`}
              >
                {chosen && <Check className="w-3.5 h-3.5 text-menta" />}
              </span>
              <OptionMedia option={o} />
              {showCorrect && <CheckCircle2 className="w-5 h-5 text-menta flex-shrink-0" />}
              {showWrong && <XCircle className="w-5 h-5 text-destructive flex-shrink-0" />}
            </button>
          );
        })}
        {options.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('activity.noOptions')}</p>
        )}
      </div>

      <SubmitButton
        submitted={submitted || isDone}
        disabled={selected.length === 0 || reveal}
        onSubmit={handleSubmit}
        testId="multi-choice-submit"
      />
    </ActivityShell>
  );
}
