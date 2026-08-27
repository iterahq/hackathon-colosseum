/**
 * MultiChoice — multiple choice, one-or-MORE correct (plan: ≈ MC v2). Toggle
 * any number of options, submit, and complete correct only when the selected
 * SET exactly equals `correct_option_ids`. Reuses the InstructionPanel + the
 * `onComplete(correct)` contract.
 *
 * NO story-only seams (ADR-4): answered/correct/incorrect are reached by
 * clicking, from the story's own `play`. `priorAnswer` replays the SET this
 * activity handed up earlier and re-grades it with the same `sameSet` below —
 * see `../internal/priorAnswer.ts` for why that is not a seam.
 */
import { useState } from 'react';
import { Check, CheckCircle2, CheckSquare, XCircle } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { ChoiceOption, MultiChoiceSpec } from '../specs.js';
import { learnerShuffle } from '../internal/shuffle.js';
import { useLearnerScope } from '../internal/useLearnerScope.js';
import {
  useActivityActionRecorder,
  type SelectionAction,
} from '../internal/actionRecorder.js';
import { answerMachine, choiceOptionState } from '../internal/answerMachine.js';
import { priorOptionIds } from '../internal/priorAnswer.js';

import { InstructionPanel } from '../components/InstructionPanel.js';
import { ActivityShell, AnswerExplanation, SubmitButton } from '../components/parts.js';
import type { ActivityCompletion, PortableActivity } from '../renderer.js';

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
  priorAnswer,
}: {
  activity: PortableActivity;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
  reveal?: boolean;
  priorAnswer?: ActivityCompletion;
}) {
  const { t } = useActivityI18n();
  // The learner half of the shuffle seed, injected by the host (ADR-3):
  // it used to be read straight out of the Player's localStorage.
  const scope = useLearnerScope();
  const spec = activity.spec as unknown as MultiChoiceSpec;
  // Per-LEARNER, per-ACTIVITY order: stable across remounts for one learner,
  // different between learners (../internal/shuffle.ts).
  const [options] = useState(() => learnerShuffle(spec?.options ?? [], scope, activity.id));
  const correctIds = spec?.correct_option_ids ?? [];
  // The learner's own earlier set, replayed — in the order they clicked it,
  // which is the order `answer_submitted` recorded and the order the artifact
  // is built from. Validated against the AUTHORED ids
  // (../internal/priorAnswer.ts); `null` when there is nothing to replay.
  const [restoredSelection] = useState<string[] | null>(
    () => priorOptionIds(priorAnswer, (spec?.options ?? []).map((o) => o.id)) ?? null,
  );
  const [selected, setSelected] = useState<string[]>(restoredSelection ?? []);
  const [submitted, setSubmitted] = useState(false);
  // Grading is the KIND's job; when the verdict may reach the screen is the
  // machine's (../internal/answerMachine.ts — one definition, six call sites).
  const isCorrect = sameSet(selected, correctIds);
  const m = answerMachine({
    done: activity.status === 'done',
    submitted,
    reveal,
    restored: restoredSelection !== null,
    correct: isCorrect,
    hasAnswer: selected.length > 0,
  });

  // The `selection` family's action sequence (sub-plan 1, Fase A).
  const trace = useActivityActionRecorder<SelectionAction>(activity.id);

  function toggle(id: string) {
    // Which DIRECTION the tap went is the signal a bare `option_selected` would
    // flatten away — "picked it, then took it back" is a different learner from
    // one who picked it once.
    //
    // ⚠️ Read off `selected` and recorded BEFORE the setState, deliberately NOT
    // inside the updater: React StrictMode double-invokes updaters in dev, so a
    // side effect in there would write every action twice.
    trace.record(selected.includes(id) ? 'option_deselected' : 'option_selected', {
      option_id: id,
    });
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // ONE-STEP: "Enviar" grades AND completes in the same click. Grade off the
  // CURRENT selection (the machine's `gradeResult` isn't set yet at click time).
  function handleSubmit() {
    if (!m.acceptsSubmit) return;
    setSubmitted(true);
    // Hand the chosen options up as text (see SingleChoiceActivity for why this
    // does not, on its own, cause a write).
    // Iterate `selected` (click order), NOT `options` — `options` is per-learner
    // SHUFFLED, so mapping over it would make the artifact's contents depend on
    // a random seed. Click order is deterministic and is also the more faithful
    // record of what the learner actually did.
    const chosen = selected
      .map((id) => `- ${options.find((o) => o.id === id)?.label ?? id}`)
      .join('\n');
    trace.record('answer_submitted', { option_ids: [...selected] });
    onComplete(isCorrect, { response: chosen, actions: trace.drain() });
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
          const state = choiceOptionState({
            shown: m.shown,
            chosen,
            isCorrectOption: correctIds.includes(o.id),
          });
          const showCorrect = state === 'correct';
          const showWrong = state === 'wrong';
          return (
            <button
              key={o.id}
              disabled={m.locked}
              onClick={() => toggle(o.id)}
              data-testid="multi-choice-option"
              // The AUTHORED id — see SingleChoiceActivity for why the index is
              // not an acceptable substitute.
              data-option-id={o.id}
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

      <AnswerExplanation spec={activity.spec} shown={m.shown} correct={m.gradeResult} />

      <SubmitButton
        submitted={m.submitLocked}
        correct={m.gradeResult}
        disabled={m.submitDisabled}
        onSubmit={handleSubmit}
        testId="multi-choice-submit"
      />
    </ActivityShell>
  );
}
