/**
 * The BYOC render, given a state — every phase the learner can see, and nothing
 * about where that state came from.
 *
 * Split from `ByocActivity` so the two-step flow can be driven in Storybook: the
 * real component reaches `generating`/`ready` only through itera-api, which the
 * canvas has no base URL for, so before this split the vitrine could only show
 * the two steps as separate, disconnected stories.
 *
 * This is a container/presenter split, NOT the injection seam ADR-4 deleted:
 * `ByocActivity` keeps its exact props, and `state` is how this component is fed
 * in production too. A test would mock the module instead (see
 * `byocLivePhases.test.tsx`); Storybook cannot.
 */
import { Sparkles } from 'lucide-react';
import type { ByocSpec } from '@iterahq/activity-spec';
import { useI18n } from '@/i18n';
import type { Activity } from '@/types/content';
import type { ActivityCompleteDetail } from '../activityFeedbackKinds';
import { InstructionPanel } from '../InstructionPanel';
import { ActivityShell } from '../parts';
import { resolveByocInstruction } from './byocSpec';
import { ByocSeedForm } from './ByocSeedForm';
import { ByocTree } from './ByocTree';
import { ByocWaiting } from './ByocWaiting';
import type { ByocState } from './useByoc';

export function ByocActivityView({
  activity,
  spec,
  onComplete,
  reveal = false,
  state,
}: {
  activity: Activity;
  spec: ByocSpec;
  onComplete: (correct: boolean, detail?: ActivityCompleteDetail) => void;
  reveal?: boolean;
  state: ByocState;
}) {
  const { t, locale } = useI18n();
  const { phase, generation, seedError, submitSeed, reset } = state;
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
          <p className="text-sm text-muted-foreground" data-testid="byoc-fallback-note">
            {t('byoc.fallbackNote')}
          </p>
          <div className="mt-4">
            <ByocTree
              key={generation?.generation_id ?? 'authored'}
              tree={fallbackTree}
              seed={generation?.seed ?? ''}
              reveal={reveal}
              done={isDone}
              onComplete={onComplete}
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
              seed={generation.seed}
              reveal={reveal}
              done={isDone}
              onComplete={onComplete}
            />
          </div>
        </>
      )}
    </ActivityShell>
  );
}
