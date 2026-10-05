/**
 * QUIZ — the hero activity. Renders INLINE (no card shell) inside the focused
 * column: a green-mono uppercase eyebrow, the bold question, then the options.
 * A 2-option quiz renders as side-by-side buttons (the True/False target); a
 * quiz with more options falls back to a stacked list.
 *
 * It is the ONE kind in this package that does not use `ActivityShell`, and
 * that is a design decision rather than an oversight: the quiz IS the screen,
 * so wrapping it in a card would put a border around the whole page. A host
 * that lays out its own chrome gets a question block and an options block, and
 * nothing that assumes it sits inside a lesson.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT IS NOT `single_choice` WITH A DIFFERENT SKIN
 * ─────────────────────────────────────────────────────────────────────────────
 * Three differences, all in the authored contract, none cosmetic:
 *
 *  1. correctness lives on the OPTION (`options[].isCorrect`), not in a
 *     top-level `correct_option_id`;
 *  2. the stem is a plain string (`question` / `prompt`), not an
 *     InstructionPanel;
 *  3. options carry NO required id, so there is nothing stable to key on.
 *
 * (3) is why this is the only kind in the selection family whose trace records
 * an INDEX. That is safe here and nowhere else, because the quiz is also the
 * only kind that does not shuffle: the index IS the authored position. A quiz
 * that ever starts shuffling must grow authored ids in the same change, or
 * every recorded action silently starts pointing at a different option.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT DOES NOT RESTORE A PRIOR ANSWER
 * ─────────────────────────────────────────────────────────────────────────────
 * `single_choice`, `multi_choice`, `order` and `match` read
 * `ActivityRendererProps.priorAnswer` and render a `done` activity as the
 * learner left it. This kind grades too, so it looks like the fifth. It is
 * excluded ON PURPOSE, for a reason that lives four lines below: its option
 * buttons are `disabled={submitted || reveal}` — deliberately WITHOUT `done`,
 * because the quiz has always left them clickable on a completed render.
 *
 * Restore a verdict onto a screen the learner can still re-pick and the colours
 * move under them as they click: they would be able to "fix" a wrong past
 * answer and watch it turn green. That is a worse render than the greyed-fresh
 * one the replay exists to fix.
 *
 * So the order of operations is: decide whether a `done` quiz should lock its
 * options FIRST — that is a behaviour change with its own consumers — and only
 * then wire the replay. Asserted meanwhile in
 * `src/test/activityPriorAnswerRestore.test.tsx`, so this stays a decision
 * rather than decaying into an oversight.
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useActivityI18n } from '../context.js';
import type { ActivityCompletion, PortableActivity } from '../renderer.js';
import type { QuizOption, QuizSpec } from '../specs.js';
import { answerMachine, choiceOptionState } from '../internal/answerMachine.js';
import { parseInline } from '../internal/richText.js';
import { RichSpans } from '../components/RichSpans.js';
import { AnswerExplanation, SubmitButton } from '../components/parts.js';
import { tactileSurface } from '../components/tactileSurface.js';
import { VerdictMark } from '../components/VerdictMark.js';
import { TeraPeek, useTeraMentioned } from '../components/teraPresence.js';
import {
  useActivityActionRecorder,
  type SelectionAction,
} from '../internal/actionRecorder.js';

/**
 * The visible text of a quiz option — the single definition, used by both the
 * rendered button and the recorded answer summary so they can never drift.
 */
function quizOptionLabel(o: QuizOption, i: number): string {
  return o.text ?? o.label ?? String(o.id ?? i + 1);
}

export function QuizActivity({
  activity,
  onComplete,
  reveal = false,
}: {
  activity: PortableActivity;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
  reveal?: boolean;
}) {
  const { t } = useActivityI18n();
  const tera = useTeraMentioned();
  const spec = activity.spec as unknown as QuizSpec;
  const options = useMemo(() => spec?.options ?? [], [spec?.options]);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  // See the header: the INDEX is the option identity for this kind alone.
  const trace = useActivityActionRecorder<SelectionAction>(activity.id);

  const correctIdx = options.findIndex((o) => o.isCorrect);
  // Grading is the KIND's job; when the verdict may reach the screen is the
  // machine's (../internal/answerMachine.ts — one definition, six call sites).
  const isQuizCorrect = selected === correctIdx;
  const m = answerMachine({
    done: activity.status === 'done',
    submitted,
    reveal,
    correct: isQuizCorrect,
    hasAnswer: selected !== null,
  });

  // ONE-STEP: "Enviar" grades AND completes in the same click (no second
  // "Marcar como concluída"). Grade off the CURRENT selection — the machine's
  // `gradeResult` isn't set yet at click time.
  function handleSubmit() {
    if (!m.acceptsSubmit) return;
    setSubmitted(true);
    const chosen = selected !== null ? options[selected] : undefined;
    trace.record('answer_submitted', {
      option_ids: selected !== null ? [String(selected)] : [],
    });
    onComplete(isQuizCorrect, {
      response: chosen ? quizOptionLabel(chosen, selected as number) : '',
      actions: trace.drain(),
    });
  }

  // Small green-mono label above the question. Prefer the spec's own label;
  // a 2-option quiz defaults to the canonical "TRUE OR FALSE?" eyebrow.
  const eyebrow =
    spec?.label ?? (options.length === 2 ? t('quiz.trueOrFalse') : t('activity.quizPrompt'));
  const question = spec?.question ?? spec?.prompt ?? t('activity.quizPrompt');
  const sideBySide = options.length === 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid="activity-quiz"
      data-activity-kind="quiz"
    >
      {/* Question card — subtle border, slightly-lighter dark bg. The hero kind
          has no ActivityShell, so Tera peeks over this card instead. */}
      <div className="relative rounded-3xl border border-border bg-card p-6 md:p-7" data-tera={tera ? 'true' : undefined}>
        {tera && <TeraPeek />}
        <div
          className="font-mono text-[11px] uppercase tracking-wider text-evergreen-hi"
          data-testid="quiz-eyebrow"
        >
          {eyebrow}
        </div>
        <h2
          className="font-display font-bold text-xl md:text-2xl text-foreground mt-2"
          data-testid="quiz-question"
        >
          <RichSpans spans={parseInline(question)} />
        </h2>
      </div>

      {/* Options */}
      <div
        className={`mt-5 ${sideBySide ? 'grid grid-cols-2 gap-4' : 'space-y-2.5'}`}
        data-testid="quiz-options"
      >
        {options.map((o, i) => {
          const label = quizOptionLabel(o, i);
          const chosen = selected === i;
          const state = choiceOptionState({
            shown: m.shown,
            chosen,
            isCorrectOption: Boolean(o.isCorrect),
          });
          const showCorrect = state === 'correct';
          const showWrong = state === 'wrong';
          return (
            <button
              key={i}
              // DELIBERATELY not `m.locked`: the quiz has always left options
              // clickable on a merely-`done` render (only the submit affordance
              // locks). Swapping in `m.locked` would add `done` and change
              // behaviour — don't "tidy" this. `reveal` IS included: once the
              // instructor puts the answer key on screen, re-picking would
              // recolor it.
              disabled={submitted || reveal}
              onClick={() => {
                trace.record('option_selected', { option_id: String(i) });
                setSelected(i);
              }}
              data-testid="quiz-option"
              data-verdict={showCorrect ? 'right' : showWrong ? 'miss' : undefined}
              className={`px-5 ${sideBySide ? 'h-16' : 'min-h-14'} ${tactileSurface(
                showCorrect ? 'right' : showWrong ? 'miss' : chosen ? 'picked' : 'idle',
                !(submitted || reveal),
              )} ${m.shown && state === 'idle' ? 'opacity-60' : ''} ${
                sideBySide
                  ? 'flex items-center justify-center text-center font-display font-bold text-lg'
                  : 'w-full flex items-center gap-3 py-3 text-left'
              }`}
            >
              <span className={sideBySide ? '' : 'flex-1'}>{label}</span>
              {!sideBySide && <VerdictMark verdict={showCorrect ? 'right' : showWrong ? 'miss' : null} />}
            </button>
          );
        })}
        {options.length === 0 && <p className="text-sm text-muted-foreground">{spec?.prompt}</p>}
      </div>

      <AnswerExplanation spec={activity.spec} shown={m.shown} correct={m.gradeResult} />

      {/* BOTTOM ZONE — just the action. The correct/incorrect message lives in
          the host's own feedback surface (the Player's viewport-fixed
          FeedbackFooter), NOT inline. */}
      <SubmitButton
        submitted={m.submitLocked}
        correct={m.gradeResult}
        disabled={m.submitDisabled}
        onSubmit={handleSubmit}
        testId="quiz-submit"
      />
    </motion.div>
  );
}
