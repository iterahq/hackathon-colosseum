/**
 * Match — connect cards on the LEFT to cards on the RIGHT (plan: card-select
 * matching, NOT a free canvas). Two ways to make a pair: tap a left card to arm
 * it, then tap a right card; or drag from the connector strip on a left card
 * to a right card. Pairs are drawn as a line behind the cards and shown with a
 * NUMBER badge (1, 2, 3…) on BOTH cards, in the order the learner created them.
 * Tapping EITHER card of an existing pair (or the strip of the left one)
 * DESELECTS that pair (removes the line and the number), freeing them to be
 * re-paired. Submit checks every pair against `spec.pairs`.
 *
 * UX contract:
 *   • Pre-submit: lines are solid and green-ish, with no correctness signal.
 *   • Post-submit: a right pair keeps a solid green line and both cards go
 *     green; a wrong pair's line turns DASHED and quiet and both cards go
 *     dashed (never red inside an activity). The badge keeps the number and
 *     carries the shape too (✓ / ✗), so meaning never rests on color alone.
 *
 * NO story-only seams (ADR-4): the paired/correct/incorrect states are reached
 * by tapping left card then right card, from the story's own `play`.
 * `priorAnswer` replays the PAIRING this activity handed up earlier — each side
 * checked against its own column, each card used at most once, so only a
 * pairing the tap interaction can produce is accepted — and every badge is then
 * re-derived by the same `isPairCorrect` a live submit runs
 * (see `../internal/priorAnswer.ts`).
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
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
import { priorPairs } from '../internal/priorAnswer.js';

import { InstructionPanel } from '../components/InstructionPanel.js';
import { ActivityShell, AnswerExplanation, SubmitButton } from '../components/parts.js';
import { tactileSurface, type SurfaceState } from '../components/tactileSurface.js';
import type { ActivityCompletion, PortableActivity } from '../renderer.js';
import { TOUCH_SURFACE } from '../components/touchSurface.js';

/** One learner-created pairing, kept in creation order so numbering is stable. */
interface MadePair {
  left_id: string;
  right_id: string;
}

function CardBody({ option }: { option: ChoiceOption }) {
  return (
    <div className="flex items-start gap-2 min-w-0 flex-1">
      {option.image_url && (
        <img src={option.image_url} alt={option.label ?? option.id} draggable={false} className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
      )}
      {option.label && <span className="min-w-0 whitespace-normal break-words">{option.label}</span>}
      {option.audio_url && (
        <audio src={option.audio_url} controls className="h-7 max-w-[8rem]" onClick={(e) => e.stopPropagation()} />
      )}
    </div>
  );
}

/**
 * The pairing indicator that sits on the outer corner of each paired card, out
 * of the flow so it never reflows the card's text.
 * Pre-submit: neutral pill with the ordinal number.
 * Post-submit: green(✓) or quiet dashed(✗) chip carrying number + correctness
 * together — shape and color, so not color-alone.
 */
function PairBadge({ n, state, side }: { n: number; state: 'neutral' | 'correct' | 'incorrect'; side: 'left' | 'right' }) {
  const base = `absolute -top-2 ${
    side === 'left' ? '-left-2' : '-right-2'
  } z-10 inline-flex items-center gap-1 h-6 min-w-6 px-1.5 rounded-full text-xs font-mono font-semibold`;
  if (state === 'correct') {
    return (
      <span className={`${base} bg-evergreen text-obsidiana`} data-testid="match-badge" data-state="correct">
        <Check className="w-3 h-3" strokeWidth={3} aria-hidden />
        {n}
        <span className="sr-only"> — correct</span>
      </span>
    );
  }
  if (state === 'incorrect') {
    return (
      <span
        className={`${base} border border-dashed border-foreground/40 bg-card text-foreground/60`}
        data-testid="match-badge"
        data-state="incorrect"
      >
        <X className="w-3 h-3" strokeWidth={2.5} aria-hidden />
        {n}
        <span className="sr-only"> — incorrect</span>
      </span>
    );
  }
  return (
    <span className={`${base} bg-evergreen-soft text-menta border border-evergreen/40`} data-testid="match-badge" data-state="neutral">
      {n}
    </span>
  );
}

/** A smooth curve from the right edge of one box to the left edge of another, in container space. */
function wirePath(x1: number, y1: number, x2: number, y2: number): string {
  const bend = Math.max(16, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

const pairKey = (p: MadePair) => `${p.left_id}:${p.right_id}`;
const DRAG_THRESHOLD = 6;

export function MatchActivity({
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
  const spec = activity.spec as unknown as MatchSpec;
  // Shuffle each column independently so the correct row-alignment
  // (left[i] ↔ right[i]) never leaks the answer. Correctness is id-keyed.
  // Per-LEARNER, per-ACTIVITY order (../internal/shuffle.ts). The two
  // columns carry different salts so the draws stay independent.
  const [left] = useState(() => learnerShuffle(spec?.left ?? [], scope, activity.id, 'left'));
  const [right] = useState(() => learnerShuffle(spec?.right ?? [], scope, activity.id, 'right'));
  const pairs = spec?.pairs ?? [];

  // The learner's own earlier pairing, replayed — in CREATION order, because
  // that is what numbers the badges, and the trace stored it that way.
  // Validated against the two authored columns (../internal/priorAnswer.ts).
  const [restoredPairs] = useState<MadePair[] | null>(
    () =>
      priorPairs(
        priorAnswer,
        (spec?.left ?? []).map((o) => o.id),
        (spec?.right ?? []).map((o) => o.id),
      ) ?? null,
  );
  const [made, setMade] = useState<MadePair[]>(restoredPairs ?? []);
  const [armedLeft, setArmedLeft] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  // The `arrangement` family's action sequence (sub-plan 1, Fase A).
  const trace = useActivityActionRecorder<ArrangementAction>(activity.id);
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const [wires, setWires] = useState<Record<string, string>>({});
  // The live line of a drag in flight, already a path in container space.
  const [drag, setDrag] = useState<string | null>(null);
  const dragRef = useRef<{ from: string; startX: number; startY: number; moved: boolean } | null>(null);

  const isPairCorrect = (p: MadePair) => pairs.some((sp) => sp.left_id === p.left_id && sp.right_id === p.right_id);
  const canSubmit = made.length === Math.min(left.length, pairs.length || left.length);
  // Grading is the KIND's job; when the verdict may reach the screen is the
  // machine's (../internal/answerMachine.ts — one definition, six call sites).
  const isMatchCorrect = pairs.length > 0 && made.length === pairs.length && made.every(isPairCorrect);
  const m = answerMachine({
    done: activity.status === 'done',
    submitted,
    reveal,
    restored: restoredPairs !== null,
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

  useLayoutEffect(() => {
    if (!locked) return;
    dragRef.current = null;
    setDrag(null);
  }, [locked]);

  const setCard = (key: string) => (el: HTMLElement | null) => {
    if (el) cardRefs.current.set(key, el);
    else cardRefs.current.delete(key);
  };

  const measure = useCallback(() => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    const next: Record<string, string> = {};
    for (const p of displayedPairs) {
      const a = cardRefs.current.get(`L:${p.left_id}`)?.getBoundingClientRect();
      const b = cardRefs.current.get(`R:${p.right_id}`)?.getBoundingClientRect();
      if (!a || !b) continue;
      next[pairKey(p)] = wirePath(a.right - box.left, a.top + a.height / 2 - box.top, b.left - box.left, b.top + b.height / 2 - box.top);
    }
    setWires((prev) => {
      const keys = Object.keys(next);
      return keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === next[k]) ? prev : next;
    });
  }, [displayedPairs]);

  // Every size change of the container moves the cards, and so the wires: the
  // columns wrap, an image loads, the window resizes.
  useLayoutEffect(() => {
    measure();
    const box = containerRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [measure, left, right]);

  // The right card under the pointer, by rectangle: the drop is forgiving by a few pixels.
  function rightCardAt(clientX: number, clientY: number): string | null {
    for (const o of right) {
      const r = cardRefs.current.get(`R:${o.id}`)?.getBoundingClientRect();
      if (r && clientX >= r.left - 8 && clientX <= r.right + 8 && clientY >= r.top - 4 && clientY <= r.bottom + 4) return o.id;
    }
    return null;
  }

  function startDrag(e: React.PointerEvent<HTMLElement>, id: string) {
    if (locked) return;
    e.preventDefault();
    dragRef.current = { from: id, startX: e.clientX, startY: e.clientY, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function moveDrag(e: React.PointerEvent<HTMLElement>) {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      // Same rule as a tap: a paired left card gives up its pair before it can make another.
      const paired = leftPairIndex(d.from);
      if (paired !== -1) {
        recordBroken(paired);
        removeAt(paired);
      }
      trace.record('pair_armed', { left_id: d.from });
    }
    const box = containerRef.current?.getBoundingClientRect();
    const a = cardRefs.current.get(`L:${d.from}`)?.getBoundingClientRect();
    if (!box || !a) return;
    setDrag(wirePath(a.right - box.left, a.top + a.height / 2 - box.top, e.clientX - box.left, e.clientY - box.top));
  }

  function endDrag(e: React.PointerEvent<HTMLElement>) {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    // A press that never travelled is a tap on the left card.
    if (!d.moved) return tapLeft(d.from);
    const target = rightCardAt(e.clientX, e.clientY);
    if (!target) return;
    const occupied = rightPairIndex(target);
    if (occupied !== -1) {
      // Same as tapping an occupied right card: it undoes that pair and makes none.
      recordBroken(occupied);
      removeAt(occupied);
      return;
    }
    trace.record('pair_made', { left_id: d.from, right_id: target });
    setMade((prev) => [...prev, { left_id: d.from, right_id: target }]);
    setArmedLeft(null);
  }

  function cancelDrag() {
    dragRef.current = null;
    setDrag(null);
  }

  // Badge state for a paired card (neutral pre-submit; green/red after submit).
  const badgeState = (idx: number): 'neutral' | 'correct' | 'incorrect' => {
    if (idx === -1 || !shown) return 'neutral';
    return isPairCorrect(displayedPairs[idx]) ? 'correct' : 'incorrect';
  };

  // The verdict of a displayed pair, or null while nothing is graded.
  const verdictOf = (idx: number): 'right' | 'miss' | null =>
    shown && idx !== -1 ? (isPairCorrect(displayedPairs[idx]) ? 'right' : 'miss') : null;

  function cardClasses(idx: number, armed: boolean) {
    const verdict = verdictOf(idx);
    const state: SurfaceState = verdict ?? (armed || idx !== -1 ? 'picked' : 'idle');
    return `${tactileSurface(state, !locked)} ${locked ? 'cursor-default' : ''}`;
  }

  return (
    <ActivityShell kind="match" icon={Link2} label={t('activity.match')}>
      <InstructionPanel spec={spec?.instruction} />
      <p className="mt-4 text-xs font-mono uppercase tracking-wider text-muted-foreground">
        {t('activity.matchHint')}
      </p>

      <div ref={containerRef} className={`relative mt-4 grid grid-cols-2 gap-y-6 gap-x-10 sm:gap-x-20 ${TOUCH_SURFACE}`} data-testid="match-columns">
        <svg
          aria-hidden
          className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
          data-testid="match-wires"
        >
          {displayedPairs.map((p, idx) => {
            const d = wires[pairKey(p)];
            if (!d) return null;
            const verdict = verdictOf(idx);
            if (verdict === 'miss') {
              return (
                <path
                  key={pairKey(p)}
                  d={d}
                  data-verdict="miss"
                  fill="none"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray="6 6"
                  className="stroke-foreground/35"
                />
              );
            }
            return (
              <motion.path
                key={pairKey(p)}
                d={d}
                data-verdict={verdict ?? undefined}
                fill="none"
                strokeWidth={3}
                strokeLinecap="round"
                initial={reduced || shown ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className={verdict === 'right' ? 'stroke-evergreen' : 'stroke-evergreen-hi/70'}
              />
            );
          })}
          {drag && !locked && <path d={drag} fill="none" strokeWidth={3} strokeLinecap="round" className="stroke-evergreen-hi/50" />}
        </svg>

        <div className="grid gap-2.5 auto-rows-fr content-start" data-testid="match-left">
          {left.map((o) => {
            const idx = leftPairIndex(o.id);
            const connected = idx !== -1;
            const armed = armedLeft === o.id;
            return (
              <div key={o.id} className="relative h-full">
                <button
                  ref={setCard(`L:${o.id}`)}
                  onClick={() => tapLeft(o.id)}
                  disabled={locked}
                  data-testid="match-left-card"
                  // The AUTHORED id — `spec.pairs` is keyed on exactly this.
                  data-option-id={o.id}
                  data-connected={connected ? 'true' : undefined}
                  data-verdict={verdictOf(idx) ?? undefined}
                  className={`relative w-full h-full flex items-start justify-between gap-2 py-3 pl-4 pr-9 text-left text-sm min-[480px]:text-base ${cardClasses(idx, armed)}`}
                >
                  <CardBody option={o} />
                  {connected && <PairBadge n={idx + 1} state={badgeState(idx)} side="left" />}
                </button>
                {!locked && (
                  <span
                    aria-hidden
                    data-testid="match-connector"
                    onPointerDown={(e) => startDrag(e, o.id)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={cancelDrag}
                    style={{ touchAction: 'none' }}
                    className="absolute right-0 top-0 h-full w-9 flex items-center justify-center cursor-crosshair"
                  >
                    <span
                      className={`w-3 h-3 rounded-full border-2 ${
                        connected || armed ? 'border-evergreen bg-evergreen' : 'border-muted-foreground/50 bg-card'
                      }`}
                    />
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid gap-2.5 auto-rows-fr content-start" data-testid="match-right">
          {right.map((o) => {
            const idx = rightPairIndex(o.id);
            const connected = idx !== -1;
            return (
              <div key={o.id} className="relative h-full">
                <button
                  ref={setCard(`R:${o.id}`)}
                  onClick={() => tapRight(o.id)}
                  disabled={locked}
                  data-testid="match-right-card"
                  // The AUTHORED id — `spec.pairs` is keyed on exactly this.
                  data-option-id={o.id}
                  data-connected={connected ? 'true' : undefined}
                  data-verdict={verdictOf(idx) ?? undefined}
                  className={`relative w-full h-full flex items-start justify-between gap-2 py-3 px-4 text-left text-sm min-[480px]:text-base ${cardClasses(idx, false)}`}
                >
                  <CardBody option={o} />
                  {connected && <PairBadge n={idx + 1} state={badgeState(idx)} side="right" />}
                </button>
              </div>
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
