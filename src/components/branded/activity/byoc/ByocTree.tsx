/**
 * BYOC step 2 — answer the generated tree.
 *
 * `pick_best`: choose the one best option. `judge_each`: label every option
 * good/bad. Both grade by lookup against the gabarito the generation embedded —
 * no model call in this path.
 */
import { useState } from 'react';
import type { GeneratedChoiceTree, Verdict } from '@iterahq/activity-spec';
import { useI18n } from '@/i18n';
import {
  emptyAnswer,
  gradeByoc,
  isAnswerComplete,
  toneFor,
  withVerdict,
  type ByocAnswer,
} from '@/utils/byocAnswer';
import { answerMachine } from '@/utils/answerMachine';
import { SubmitButton } from '../parts';
import { ByocOptionCard } from './ByocOptionCard';
import { ByocVerdictButtons } from './ByocVerdictButtons';

export function ByocTree({
  tree,
  reveal = false,
  done = false,
  onComplete,
}: {
  tree: GeneratedChoiceTree;
  reveal?: boolean;
  /** Already completed in an earlier session — render locked, not answerable. */
  done?: boolean;
  onComplete: (correct: boolean) => void;
}) {
  const { t } = useI18n();
  const [answer, setAnswer] = useState<ByocAnswer>(() => emptyAnswer(tree));
  const [submitted, setSubmitted] = useState(false);
  // Grading is the KIND's job; when the verdict may reach the screen is the
  // machine's (src/utils/answerMachine.ts — one definition, six call sites).
  const isByocCorrect = gradeByoc(tree, answer);
  const m = answerMachine({
    done,
    submitted,
    reveal,
    correct: isByocCorrect,
    hasAnswer: isAnswerComplete(tree, answer),
  });
  const { shown, locked } = m;
  const isPick = tree.interaction === 'pick_best';
  const expectedById =
    tree.interaction === 'judge_each'
      ? new Map(tree.options.map((o) => [o.id, o.expected_verdict]))
      : null;

  // ONE-STEP, like every other graded kind: "Enviar" grades AND completes. Grade
  // off the CURRENT answer — the machine's `gradeResult` is gated on `submitted`,
  // which has not flipped yet at click time.
  function handleSubmit() {
    if (!m.acceptsSubmit) return;
    setSubmitted(true);
    onComplete(isByocCorrect);
  }

  return (
    <div data-testid="byoc-tree" data-interaction={tree.interaction}>
      <p className="text-sm text-muted-foreground">
        {t(isPick ? 'byoc.pickBest' : 'byoc.judgeEach')}
      </p>

      <div className="mt-4 grid gap-2.5">
        {tree.options.map((o) => {
          const pick = () => setAnswer({ interaction: 'pick_best', selected: o.id });
          const selected =
            answer.interaction === 'pick_best' ? answer.selected === o.id : undefined;
          return (
            <div
              key={o.id}
              role={isPick ? 'button' : undefined}
              tabIndex={isPick && !locked ? 0 : undefined}
              onClick={isPick && !locked ? pick : undefined}
              onKeyDown={
                isPick && !locked
                  ? (e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      pick();
                    }
                  : undefined
              }
              className={isPick && !locked ? 'cursor-pointer' : undefined}
              data-testid={isPick ? 'byoc-pick-option' : undefined}
              data-selected={selected ? 'true' : undefined}
            >
              <ByocOptionCard
                option={o}
                tone={toneFor(tree, answer, o.id, shown)}
                revealResponse={shown}
              >
                {!isPick && (
                  <ByocVerdictButtons
                    given={
                      answer.interaction === 'judge_each'
                        ? (answer.verdicts[o.id] as Verdict | undefined)
                        : undefined
                    }
                    expected={shown ? expectedById?.get(o.id) : undefined}
                    disabled={locked}
                    onPick={(v) => setAnswer((prev) => withVerdict(prev, o.id, v))}
                  />
                )}
              </ByocOptionCard>
            </div>
          );
        })}
      </div>

      <SubmitButton
        submitted={m.submitLocked}
        correct={m.gradeResult}
        // `m.submitDisabled` drops the `locked` term the inline version had:
        // <SubmitButton> already ORs in its `submitted` prop (= m.submitLocked),
        // so the EFFECTIVE disabled state is unchanged. Proven exhaustively in
        // answerMachine.test.ts → "ByocTree".
        disabled={m.submitDisabled}
        onSubmit={handleSubmit}
        testId="byoc-submit"
      />
    </div>
  );
}
