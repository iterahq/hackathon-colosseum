/**
 * Match — connect cards on the LEFT to cards on the RIGHT (plan: card-select
 * matching, NOT a free canvas). Tap a left card to arm it, then tap a right
 * card to form a pair. Pairs are shown with a NUMBER badge (1, 2, 3…) on BOTH
 * cards, in the order the learner created them. Tapping EITHER card of an
 * existing pair DESELECTS that pair (removes the number from both), freeing
 * them to be re-paired. Submit checks every pair against `spec.pairs`.
 *
 * UX contract (2026-07 rework):
 *   • Pre-submit (idle + pairing): NEUTRAL styling only — no correctness/pair
 *     colors. Cards use the theme's default card bg; the armed card gets a
 *     neutral (ink, not green) selection ring. Pairing is conveyed purely by
 *     the ordinal number badge — NOT by colored dots.
 *   • Post-submit (result): keep the numbers and show correctness with ONE
 *     clean signal — the badge morphs to GREEN+check (correct) or RED+cross
 *     (incorrect), with a matching light card border. Shape (✓/✗) carries the
 *     meaning so it never relies on color alone (a11y). No stacked dot + icon +
 *     bg-fill overload.
 *
 * NO story-only seams (ADR-4): the paired/correct/incorrect states are reached
 * by tapping left card then right card, from the story's own `play`.
 */
import { useState } from 'react';
import { Check, Link2, X } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { ChoiceOption, MatchSpec } from '../specs.js';
import { learnerShuffle } from '../internal/shuffle.js';
import { useLearnerScope } from '../internal/useLearnerScope.js';
import {
  useActivityActionRecorder,
  type ArrangementAction,
} from '../internal/actionRecorder.js';
import { answerMachine } from '../internal/answerMachine.js';

import { InstructionPanel } from '../components/InstructionPanel.js';
import { ActivityShell, AnswerExplanation, SubmitButton } from '../components/parts.js';
import type { ActivityCompletion, PortableActivity } from '../renderer.js';

/** One learner-created pairing, kept in creation order so numbering is stable. */
interface MadePair {
  left_id: string;
  right_id: string;
}

function CardBody({ option }: { option: ChoiceOption }) {
  return (
    <div className="flex items-start gap-2 min-w-0 flex-1">
      {option.image_url && (
        <img src={option.image_url} alt={option.label ?? option.id} className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
      )}
      {option.label && <span className="min-w-0 whitespace-normal break-words">{option.label}</span>}
      {option.audio_url && (
        <audio src={option.audio_url} controls className="h-7 max-w-[8rem]" onClick={(e) => e.stopPropagation()} />
      )}
    </div>
  );
}

/**
 * The pairing indicator that sits on each paired card.
 * Pre-submit: neutral pill with the ordinal number.
 * Post-submit: green(✓)/red(✗) chip carrying number + correctness together —
 * the single correctness signal (color + glyph, so not color-alone).
 */
function PairBadge({ n, state }: { n: number; state: 'neutral' | 'correct' | 'incorrect' }) {
  const base =
    'inline-flex items-center gap-1 h-6 min-w-6 px-1.5 rounded-full text-xs font-mono font-semibold flex-shrink-0 border';
  if (state === 'correct') {
    return (
      <span className={`${base} bg-verde-tech text-obsidiana border-verde-tech`} data-testid="match-badge" data-state="correct">
        <Check className="w-3 h-3" strokeWidth={3} aria-hidden />
        {n}
        <span className="sr-only"> — correct</span>
      </span>
    );
  }
  if (state === 'incorrect') {
    return (
      <span
        className={`${base} bg-destructive text-destructive-foreground border-destructive`}
        data-testid="match-badge"
        data-state="incorrect"
      >
        <X className="w-3 h-3" strokeWidth={3} aria-hidden />
        {n}
        <span className="sr-only"> — incorrect</span>
      </span>
    );
  }
  return (
    <span className={`${base} bg-ink/10 text-ink border-border`} data-testid="match-badge" data-state="neutral">
      {n}
    </span>
  );
}

export function MatchActivity({
  activity,
  onComplete,
  reveal = false,
}: {
  activity: PortableActivity;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
  reveal?: boolean;
}) {
  const { t } = useActivityI18n();
  // The learner half of the shuffle seed, injected by the host (ADR-3):
  // it used to be read straight out of the Player's localStorage.
  const scope = useLearnerScope();
  const spec = activity.spec as unknown as MatchSpec;
  // Shuffle each column independently so the correct row-alignment
  // (left[i] ↔ right[i]) never leaks the answer. Correctness is id-keyed.
  // Per-LEARNER, per-ACTIVITY order (../internal/shuffle.ts). The two
  // columns carry different salts so the draws stay independent.
  const [left] = useState(() => learnerShuffle(spec?.left ?? [], scope, activity.id, 'left'));
  const [right] = useState(() => learnerShuffle(spec?.right ?? [], scope, activity.id, 'right'));
  const pairs = spec?.pairs ?? [];

  const [made, setMade] = useState<MadePair[]>([]);
  const [armedLeft, setArmedLeft] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  // The `arrangement` family's action sequence (sub-plan 1, Fase A).
  const trace = useActivityActionRecorder<ArrangementAction>(activity.id);

  const isPairCorrect = (p: MadePair) => pairs.some((sp) => sp.left_id === p.left_id && sp.right_id === p.right_id);
  const canSubmit = made.length === Math.min(left.length, pairs.length || left.length);
  // Grading is the KIND's job; when the verdict may reach the screen is the
  // machine's (../internal/answerMachine.ts — one definition, six call sites).
  const isMatchCorrect = pairs.length > 0 && made.length === pairs.length && made.every(isPairCorrect);
  const m = answerMachine({
    done: activity.status === 'done',
    submitted,
    reveal,
    correct: isMatchCorrect,
    hasAnswer: canSubmit,
  });
  const { locked, shown } = m;
  // Reveal without a submission shows the ANSWER KEY (spec pairs, all green),
  // not the learner's empty/partial pairing.
  const displayedPairs: MadePair[] = m.showKey ? pairs : made;

  // Which pair index (0-based) a given card belongs to, or -1.
  const leftPairIndex = (id: string) => displayedPairs.findIndex((p) => p.left_id === id);
  const rightPairIndex = (id: string) => displayedPairs.findIndex((p) => p.right_id === id);

  /**
   * Both cards of a pair undo the same pair, so the action is recorded in one
   * place. Spelled out field by field rather than handed the `MadePair`: the
   * payload is a wire shape, and letting a domain object flow straight into it
   * would silently widen the trace the day that object grows a field.
   */
  function recordBroken(index: number) {
    const p = displayedPairs[index];
    if (p) trace.record('pair_broken', { left_id: p.left_id, right_id: p.right_id });
  }

  function removeAt(index: number) {
    setMade((prev) => prev.filter((_, i) => i !== index));
  }

  function tapLeft(id: string) {
    if (locked) return;
    const idx = leftPairIndex(id);
    if (idx !== -1) {
      // Tapping a paired card deselects the WHOLE pair (clears both cards).
      recordBroken(idx);
      removeAt(idx);
      setArmedLeft(null);
      return;
    }
    // Arming and DIS-arming are the same tap on the same card; only the current
    // `armedLeft` tells them apart, so it is read before the setState (and
    // outside the updater — StrictMode double-invokes those in dev).
    if (armedLeft !== id) trace.record('pair_armed', { left_id: id });
    setArmedLeft((cur) => (cur === id ? null : id));
  }

  function tapRight(id: string) {
    if (locked) return;
    const idx = rightPairIndex(id);
    if (idx !== -1) {
      // Tapping a paired card deselects the WHOLE pair (clears both cards).
      recordBroken(idx);
      removeAt(idx);
      return;
    }
    if (!armedLeft) return;
    trace.record('pair_made', { left_id: armedLeft, right_id: id });
    setMade((prev) => [...prev, { left_id: armedLeft, right_id: id }]);
    setArmedLeft(null);
  }

  // ONE-STEP: "Enviar" grades AND completes in the same click (no second
  // "Marcar como concluída"). Grade off the CURRENT pairs — the machine's
  // `gradeResult` isn't set yet at click time.
  function handleSubmit() {
    if (!m.acceptsSubmit) return;
    setSubmitted(true);
    // Hand the settled pairing up as text (dropped unless the author opted in).
    const label = (list: ChoiceOption[], id: string) =>
      list.find((o) => o.id === id)?.label ?? id;
    const pairing = made
      .map((p) => `${label(left, p.left_id)} -> ${label(right, p.right_id)}`)
      .join('\n');
    trace.record('answer_submitted', {
      pairs: made.map((p) => [p.left_id, p.right_id]),
    });
    onComplete(isMatchCorrect, { response: pairing, actions: trace.drain() });
  }

  // Badge state for a paired card (neutral pre-submit; green/red after submit).
  const badgeState = (idx: number): 'neutral' | 'correct' | 'incorrect' => {
    if (idx === -1 || !shown) return 'neutral';
    return isPairCorrect(displayedPairs[idx]) ? 'correct' : 'incorrect';
  };

  // Card frame classes. Pre-submit: neutral (+ neutral ink ring when armed).
  // Post-submit: light green/red border echoing the badge (single signal).
  function cardClasses(idx: number, armed: boolean) {
    if (shown && idx !== -1) {
      return isPairCorrect(displayedPairs[idx]) ? 'border-verde-tech/60 bg-card' : 'border-destructive/60 bg-card';
    }
    if (armed) return 'border-ink/50 bg-panel-2 ring-2 ring-ink/20';
    return 'border-border bg-card hover:border-ink/30';
  }

  return (
    <ActivityShell kind="match" icon={Link2} label={t('activity.match')}>
      <InstructionPanel spec={spec?.instruction} />
      <p className="mt-4 text-xs font-mono uppercase tracking-wider text-muted-foreground">
        {t('activity.matchHint')}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-4" data-testid="match-columns">
        <div className="grid gap-2.5 auto-rows-fr content-start" data-testid="match-left">
          {left.map((o) => {
            const idx = leftPairIndex(o.id);
            const connected = idx !== -1;
            const armed = armedLeft === o.id;
            return (
              <button
                key={o.id}
                onClick={() => tapLeft(o.id)}
                disabled={locked}
                data-testid="match-left-card"
                // The AUTHORED id — `spec.pairs` is keyed on exactly this.
                data-option-id={o.id}
                data-connected={connected ? 'true' : undefined}
                className={`w-full h-full flex items-start justify-between gap-2 py-3 px-4 rounded-2xl border text-left transition-colors ${cardClasses(idx, armed)}`}
              >
                <CardBody option={o} />
                {connected && <PairBadge n={idx + 1} state={badgeState(idx)} />}
              </button>
            );
          })}
        </div>

        <div className="grid gap-2.5 auto-rows-fr content-start" data-testid="match-right">
          {right.map((o) => {
            const idx = rightPairIndex(o.id);
            const connected = idx !== -1;
            return (
              <button
                key={o.id}
                onClick={() => tapRight(o.id)}
                disabled={locked}
                data-testid="match-right-card"
                // The AUTHORED id — `spec.pairs` is keyed on exactly this.
                data-option-id={o.id}
                data-connected={connected ? 'true' : undefined}
                className={`w-full h-full flex items-start justify-between gap-2 py-3 px-4 rounded-2xl border text-left transition-colors ${cardClasses(idx, false)}`}
              >
                <CardBody option={o} />
                {connected && <PairBadge n={idx + 1} state={badgeState(idx)} />}
              </button>
            );
          })}
        </div>
      </div>

      <AnswerExplanation spec={activity.spec} shown={m.shown} correct={m.gradeResult} />

      <SubmitButton
        submitted={m.submitLocked}
        correct={m.gradeResult}
        disabled={m.submitDisabled}
        onSubmit={handleSubmit}
        testId="match-submit"
      />
    </ActivityShell>
  );
}
