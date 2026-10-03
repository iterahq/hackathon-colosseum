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
import { useRef, useState } from 'react';
import { CheckSquare } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { ChoiceOption, MultiChoiceSpec } from '../specs.js';
import { learnerOptionOrder } from '../internal/shuffle.js';
import { useLearnerScope } from '../internal/useLearnerScope.js';
import {
  useActivityActionRecorder,
  type SelectionAction,
} from '../internal/actionRecorder.js';
import { answerMachine, choiceOptionState } from '../internal/answerMachine.js';
import { priorOptionIds } from '../internal/priorAnswer.js';

import { InstructionPanel } from '../components/InstructionPanel.js';
import { ActivityShell, AnswerExplanation, SubmitButton } from '../components/parts.js';
import { ChoiceOptionCard } from '../components/ChoiceOptionCard.js';
import { useChoiceHotkeys } from '../components/useChoiceHotkeys.js';
import type { ActivityCompletion, PortableActivity } from '../renderer.js';

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

function OptionMedia({ option }: { option: ChoiceOption }) {
  return (
    <div className="flex items-center gap-3 flex-1 min-w-0">
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
  // different between learners (../internal/shuffle.ts). Reference-only labels
  // (`A`, `B`, `C` for the instruction's blocks) keep the authored order.
  const [options] = useState(() => learnerOptionOrder(spec?.options ?? [], scope, activity.id));
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

  const optionsRef = useRef<HTMLDivElement>(null);
  useChoiceHotkeys({
    scope: optionsRef,
    count: options.length,
    enabled: !m.locked,
    onPick: (i) => toggle(options[i].id),
    onSubmit: () => {
      if (!m.submitDisabled) handleSubmit();
    },
  });

  return (
    <ActivityShell kind="multi_choice" icon={CheckSquare} label={t('activity.multiChoice')}>
      <InstructionPanel spec={spec?.instruction} />
      <p className="mt-4 text-xs font-mono uppercase tracking-wider text-muted-foreground">
        {t('activity.selectAll')}
      </p>

      <div ref={optionsRef} className="mt-3 grid gap-2.5 auto-rows-fr" data-testid="multi-choice-options">
        {options.map((o, i) => {
          const chosen = selected.includes(o.id);
          const state = choiceOptionState({
            shown: m.shown,
            chosen,
            isCorrectOption: correctIds.includes(o.id),
          });
          return (
            <ChoiceOptionCard
              key={o.id}
              index={i}
              state={state}
              chosen={chosen}
              shown={m.shown}
              multi
              disabled={m.locked}
              onClick={() => toggle(o.id)}
              testId="multi-choice-option"
              // The AUTHORED id — see SingleChoiceActivity for why the index is
              // not an acceptable substitute.
              optionId={o.id}
            >
              <OptionMedia option={o} />
            </ChoiceOptionCard>
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
