/**
 * BYOC ("Bring Your Own Context") — two steps in one activity: the learner types
 * their own context, and the activity is generated on top of it.
 *
 * The model runs ONCE, at generation. Answering is a local lookup against the
 * gabarito that generation embedded (ADR-13) — no judge, no model call, so the
 * activity behaves like any other graded kind once the tree is on screen.
 */
import { useCallback, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { ByocSpec } from '@iterahq/activity-spec';
import { useI18n } from '@/i18n';
import { useAuth } from '@/auth/AuthContext';
import type { Activity } from '@/types/content';
import { InstructionPanel } from '../InstructionPanel';
import { ActivityShell } from '../parts';
import { resolveByocInstruction } from './byocSpec';
import { ByocSeedForm } from './ByocSeedForm';
import { ByocTree } from './ByocTree';
import { ByocWaiting } from './ByocWaiting';
import { useByoc } from './useByoc';

export function ByocActivity({
  activity,
  spec,
  onComplete,
  reveal = false,
}: {
  activity: Activity;
  spec: ByocSpec;
  onComplete: (correct: boolean) => void;
  reveal?: boolean;
}) {
  const { t, locale } = useI18n();
  const { session, loading } = useAuth();
  const token = session?.access_token ?? '';
  const { phase, generation, seedError, submitSeed, reset, tryAnotherSeed } = useByoc({
    activityId: activity.id,
    token,
    ready: !loading,
    fallback: spec.fallback,
  });
  // `activity.status` is the status this render was handed, and it does not flip
  // the moment the learner answers — so it alone would leave the escape hatch on
  // screen after a graded submit, and a second generation would be a second,
  // easier question for the same activity.
  const [answered, setAnswered] = useState(false);
  const handleComplete = useCallback(
    (correct: boolean) => {
      setAnswered(true);
      onComplete(correct);
    },
    [onComplete]
  );
  const isDone = activity.status === 'done';
  // BYOC replaces the host kind's whole render, so the host's own teaching
  // context would silently vanish under the layer if we didn't carry it over.
  const instruction = resolveByocInstruction(activity, locale);
  // A degraded row already carries the authored tree, and it is the one the
  // server persisted — prefer it over re-reading the spec so what the learner
  // answers is what the audit row says they were served.
  const fallbackTree = generation?.generated ?? spec.fallback;

  return (
    <ActivityShell kind="byoc" icon={Sparkles} label={t('byoc.badge')}>
      <InstructionPanel spec={instruction} />

      {phase === 'loading' && <ByocWaiting title={t('byoc.loading')} />}

      {(phase === 'seed' || phase === 'generating') && (
        <ByocSeedForm
          seed={spec.seed}
          error={seedError}
          disabled={phase === 'generating'}
          onSubmit={submitSeed}
        />
      )}

      {phase === 'generating' && (
        <ByocWaiting title={t('byoc.generating')} hint={t('byoc.generatingHint')} narrate />
      )}

      {phase === 'unavailable' && (
        <div className="py-8 text-center" data-testid="byoc-unavailable">
          <p className="font-medium text-foreground">{t('byoc.unavailable')}</p>
          <button
            type="button"
            onClick={reset}
            data-testid="byoc-retry"
            className="mt-4 h-11 px-6 rounded-full font-medium bg-evergreen text-obsidiana transition-colors hover:bg-evergreen-hi"
          >
            {t('byoc.tryAgain')}
          </button>
        </div>
      )}

      {phase === 'fallback' && fallbackTree && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" data-testid="byoc-fallback-note">
              {t('byoc.fallbackNote')}
            </p>
            {!isDone && !answered && (
              <button
                type="button"
                onClick={tryAnotherSeed}
                data-testid="byoc-try-another-seed"
                className="h-9 px-4 rounded-full text-sm font-medium border border-border text-foreground transition-colors hover:bg-muted"
              >
                {t('byoc.tryAnotherSeed')}
              </button>
            )}
          </div>
          <div className="mt-4">
            <ByocTree
              key={generation?.generation_id ?? 'authored'}
              tree={fallbackTree}
              reveal={reveal}
              done={isDone}
              onComplete={handleComplete}
            />
          </div>
        </>
      )}

      {phase === 'ready' && generation && (
        <>
          <p className="text-sm text-muted-foreground" data-testid="byoc-seed-echo">
            {t('byoc.yourContext')} <span className="text-foreground">{generation.seed}</span>
          </p>
          <div className="mt-4">
            <ByocTree
              key={generation.generation_id ?? generation.seed}
              tree={generation.generated}
              reveal={reveal}
              done={isDone}
              onComplete={handleComplete}
            />
          </div>
        </>
      )}
    </ActivityShell>
  );
}
