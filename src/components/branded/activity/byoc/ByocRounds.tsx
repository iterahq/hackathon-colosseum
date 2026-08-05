/**
 * BYOC step 2, `build_context` half — the learner assembles a request to an AI
 * one facet at a time.
 *
 * No option is right or wrong, so there is nothing to grade and nothing to
 * submit: picking reveals what the AI would answer with THAT choice, and the
 * last screen shows the prompt the learner ended up writing. Completion is the
 * success condition.
 */
import { useEffect, useState } from 'react';
import type { GeneratedChoiceTree } from '@iterahq/activity-spec';
import type { Locale } from '@iterahq/activity-spec/runtime';
import { useI18n } from '@/i18n';
import { localizedText } from '@/utils/localizedText';
import { assembleContext, pickedOption, type RoundPicks } from '@/utils/byocContext';
import { ByocOptionCard } from './ByocOptionCard';

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
  onComplete: (correct: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const [picks, setPicks] = useState<RoundPicks>({});
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(done);

  const round = tree.rounds[index];
  const chosen = round ? pickedOption(round, picks) : undefined;
  const isLast = index === tree.rounds.length - 1;

  const advance = () => (isLast ? setFinished(true) : setIndex((i) => i + 1));

  // Completing is reaching the last screen — there is no verdict to report, so
  // `correct` is always true. Firing from an effect (not from `advance`) keeps
  // the already-done case, which mounts finished, from re-reporting on mount.
  useEffect(() => {
    if (finished && !done) onComplete(true);
  }, [finished, done, onComplete]);

  if (finished || !round) {
    return (
      <div data-testid="byoc-rounds" data-interaction="build_context">
        <p className="text-sm text-muted-foreground">{t('byoc.contextReady')}</p>
        <pre
          data-testid="byoc-assembled-context"
          className="mt-3 whitespace-pre-wrap rounded-2xl border border-menta bg-menta/10 px-5 py-4 text-sm text-foreground"
        >
          {assembleContext(seed, tree.rounds, picks, locale as Locale)}
        </pre>
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
        {round.options.map((o) => {
          const isChosen = chosen?.id === o.id;
          const pick = () => setPicks((prev) => ({ ...prev, [round.id]: o.id }));
          return (
            <div
              key={o.id}
              role="button"
              tabIndex={0}
              onClick={pick}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                pick();
              }}
              className="cursor-pointer"
              data-testid="byoc-round-option"
              data-selected={isChosen ? 'true' : undefined}
            >
              <ByocOptionCard option={o} tone={isChosen ? 'chosen' : 'neutral'} revealResponse={isChosen} />
            </div>
          );
        })}
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
