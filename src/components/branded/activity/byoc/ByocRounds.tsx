/**
 * BYOC step 2, `build_context` half — the learner assembles a request to an AI
 * one facet at a time.
 *
 * No option is right or wrong, so there is nothing to grade and nothing to
 * submit: picking reveals what the AI would answer with THAT choice, and the
 * last screen shows the prompt the learner ended up writing. Completion is the
 * success condition.
 */
import { useEffect, useRef, useState } from 'react';
import type { GeneratedChoiceTree, GeneratedOption } from '@iterahq/activity-spec';
import type { Locale } from '@iterahq/activity-spec/runtime';
import { useI18n } from '@/i18n';
import { localizedText } from '@/utils/localizedText';
import { assembleContext, pickedOption, type RoundPicks } from '@/utils/byocContext';
import type { ActivityCompleteDetail } from '../activityFeedbackKinds';
import { ByocClosingQuestion } from './ByocClosingQuestion';
import { ByocPickable } from './ByocPickable';

type BuildContextTree = Extract<GeneratedChoiceTree, { interaction: 'build_context' }>;

export function ByocRounds({
  tree,
  seed = '',
  done = false,
  onComplete,
}: {
  tree: BuildContextTree;
  /** The learner's own free text — the first line of the prompt they assemble. */
  seed?: string;
  done?: boolean;
  onComplete: (correct: boolean, detail?: ActivityCompleteDetail) => void;
}) {
  const { t, locale } = useI18n();
  const [picks, setPicks] = useState<RoundPicks>({});
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(done);
  const reported = useRef(false);

  const round = tree.rounds[index];
  const chosen = round ? pickedOption(round, picks) : undefined;
  const isLast = index === tree.rounds.length - 1;
  const assembled = assembleContext(seed, tree.rounds, picks, locale as Locale);

  const advance = () => (isLast ? setFinished(true) : setIndex((i) => i + 1));

  // Read through a ref so the effect does not depend on the host's callback:
  // BYOC is footer-graded, so `done` stays false while the footer is pending,
  // and both hosts rebuild `onComplete` every render — as a dependency it would
  // re-fire completion forever. The latch is what makes it exactly once.
  const latest = useRef({ assembled, onComplete });
  latest.current = { assembled, onComplete };

  useEffect(() => {
    if (!finished || done || reported.current) return;
    reported.current = true;
    latest.current.onComplete(true, { response: latest.current.assembled });
  }, [finished, done]);

  if (finished || !round) {
    // Mounting already finished means an earlier session, whose picks this
    // render does not have — printing the empty assembly would show the bare
    // seed under a line claiming it is the request the learner built.
    const made = tree.rounds
      .map((r) => ({ roundId: r.id, option: pickedOption(r, picks) }))
      .filter((m): m is { roundId: string; option: GeneratedOption } => m.option !== undefined);
    return (
      <div data-testid="byoc-rounds" data-interaction="build_context">
        <p className="text-sm text-muted-foreground">
          {t(made.length ? 'byoc.contextReady' : 'byoc.contextBuiltEarlier')}
        </p>
        {made.length > 0 && (
          <pre
            data-testid="byoc-assembled-context"
            className="mt-3 whitespace-pre-wrap wrap-break-word rounded-2xl border border-azul bg-azul/10 px-5 py-4 text-sm text-foreground"
          >
            {assembled}
          </pre>
        )}

        {made.length > 0 && <ByocClosingQuestion picks={made} />}
      </div>
    );
  }

  return (
    <div data-testid="byoc-rounds" data-interaction="build_context" data-round={round.id}>
      <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {t('byoc.roundCounter')
          .replace('{n}', String(index + 1))
          .replace('{total}', String(tree.rounds.length))}
      </p>
      <p className="mt-1 text-foreground">
        {localizedText(round.question, locale as Locale)}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{t('byoc.noWrongAnswer')}</p>

      <div className="mt-4 grid gap-2.5">
        {round.options.map((o) => (
          <ByocPickable
            key={o.id}
            option={o}
            picked={chosen?.id === o.id}
            onPick={() => setPicks((prev) => ({ ...prev, [round.id]: o.id }))}
            testId="byoc-round-option"
          />
        ))}
      </div>

      <button
        type="button"
        disabled={chosen === undefined}
        onClick={advance}
        data-testid="byoc-round-next"
        className="mt-5 h-11 px-6 rounded-full font-medium bg-evergreen text-obsidiana transition-colors hover:bg-evergreen-hi disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t(isLast ? 'byoc.seeMyContext' : 'byoc.nextRound')}
      </button>
    </div>
  );
}
