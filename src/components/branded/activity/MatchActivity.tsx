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
 * `initial*` props are story-only hooks for the answered/correct/incorrect states.
 */
import { useState } from 'react';
import { Check, Link2, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Activity, ChoiceOption, MatchSpec } from '@/types/content';
import { InstructionPanel } from './InstructionPanel';
import { ActivityShell, SubmitButton } from './parts';

/** One learner-created pairing, kept in creation order so numbering is stable. */
interface MadePair {
  left_id: string;
  right_id: string;
}

function CardBody({ option }: { option: ChoiceOption }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {option.image_url && (
        <img src={option.image_url} alt={option.label ?? option.id} className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
      )}
      {option.label && <span className="truncate">{option.label}</span>}
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
  initialConnections,
  initialSubmitted = false,
}: {
  activity: Activity;
  onComplete: (correct: boolean) => void;
  /** left_id -> right_id (story/test hook; converted to ordered pairs on init) */
  initialConnections?: Record<string, string>;
  initialSubmitted?: boolean;
}) {
  const { t } = useI18n();
  const spec = activity.spec as unknown as MatchSpec;
  const left = spec?.left ?? [];
  const right = spec?.right ?? [];
  const pairs = spec?.pairs ?? [];

  const [made, setMade] = useState<MadePair[]>(() =>
    Object.entries(initialConnections ?? {}).map(([left_id, right_id]) => ({ left_id, right_id })),
  );
  const [armedLeft, setArmedLeft] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(initialSubmitted);
  const isDone = activity.status === 'done';
  const locked = submitted || isDone;

  // Which pair index (0-based) a given card belongs to, or -1.
  const leftPairIndex = (id: string) => made.findIndex((p) => p.left_id === id);
  const rightPairIndex = (id: string) => made.findIndex((p) => p.right_id === id);

  function removeAt(index: number) {
    setMade((prev) => prev.filter((_, i) => i !== index));
  }

  function tapLeft(id: string) {
    if (locked) return;
    const idx = leftPairIndex(id);
    if (idx !== -1) {
      // Tapping a paired card deselects the WHOLE pair (clears both cards).
      removeAt(idx);
      setArmedLeft(null);
      return;
    }
    setArmedLeft((cur) => (cur === id ? null : id));
  }

  function tapRight(id: string) {
    if (locked) return;
    const idx = rightPairIndex(id);
    if (idx !== -1) {
      // Tapping a paired card deselects the WHOLE pair (clears both cards).
      removeAt(idx);
      return;
    }
    if (!armedLeft) return;
    setMade((prev) => [...prev, { left_id: armedLeft, right_id: id }]);
    setArmedLeft(null);
  }

  const isPairCorrect = (p: MadePair) => pairs.some((sp) => sp.left_id === p.left_id && sp.right_id === p.right_id);

  const canSubmit = made.length === Math.min(left.length, pairs.length || left.length);

  // ONE-STEP: "Enviar" grades AND completes in the same click (no second
  // "Marcar como concluída"). Grade off the CURRENT pairs — the submitted-gated
  // result flags aren't set yet at click time.
  function handleSubmit() {
    if (locked) return;
    setSubmitted(true);
    onComplete(pairs.length > 0 && made.length === pairs.length && made.every(isPairCorrect));
  }

  // Badge state for a paired card (neutral pre-submit; green/red after submit).
  const badgeState = (idx: number): 'neutral' | 'correct' | 'incorrect' => {
    if (idx === -1 || !submitted) return 'neutral';
    return isPairCorrect(made[idx]) ? 'correct' : 'incorrect';
  };

  // Card frame classes. Pre-submit: neutral (+ neutral ink ring when armed).
  // Post-submit: light green/red border echoing the badge (single signal).
  function cardClasses(idx: number, armed: boolean) {
    if (submitted && idx !== -1) {
      return isPairCorrect(made[idx]) ? 'border-verde-tech/60 bg-card' : 'border-destructive/60 bg-card';
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
        <div className="space-y-2.5" data-testid="match-left">
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
                data-connected={connected ? 'true' : undefined}
                className={`w-full flex items-center justify-between gap-2 py-3 px-4 rounded-2xl border text-left transition-colors ${cardClasses(idx, armed)}`}
              >
                <CardBody option={o} />
                {connected && <PairBadge n={idx + 1} state={badgeState(idx)} />}
              </button>
            );
          })}
        </div>

        <div className="space-y-2.5" data-testid="match-right">
          {right.map((o) => {
            const idx = rightPairIndex(o.id);
            const connected = idx !== -1;
            return (
              <button
                key={o.id}
                onClick={() => tapRight(o.id)}
                disabled={locked}
                data-testid="match-right-card"
                data-connected={connected ? 'true' : undefined}
                className={`w-full flex items-center justify-between gap-2 py-3 px-4 rounded-2xl border text-left transition-colors ${cardClasses(idx, false)}`}
              >
                <CardBody option={o} />
                {connected && <PairBadge n={idx + 1} state={badgeState(idx)} />}
              </button>
            );
          })}
        </div>
      </div>

      <SubmitButton
        submitted={locked}
        disabled={!canSubmit}
        onSubmit={handleSubmit}
        testId="match-submit"
      />
    </ActivityShell>
  );
}
