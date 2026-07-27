/**
 * BYOC ("Bring Your Own Context") — two steps in one activity: the learner types
 * their own context, and the activity is generated on top of it.
 *
 * The model runs ONCE, at generation. Answering is a local lookup against the
 * gabarito that generation embedded (ADR-13) — no judge, no model call, so the
 * activity behaves like any other graded kind once the tree is on screen.
 */
import { Sparkles } from 'lucide-react';
import type { ByocSpec } from '@iterahq/activity-spec';
import { useI18n } from '@/i18n';
import { useAuth } from '@/auth/AuthContext';
import type { Activity, InstructionPanelSpec } from '@/types/content';
import { InstructionPanel } from '../InstructionPanel';
import { ActivityShell } from '../parts';
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
  const { t } = useI18n();
  const { session, loading } = useAuth();
  const token = session?.access_token ?? '';
  const { phase, generation, seedError, submitSeed, reset } = useByoc({
    activityId: activity.id,
    token,
    ready: !loading,
    fallback: spec.fallback,
  });
  const isDone = activity.status === 'done';
  // BYOC replaces the host kind's whole render, so the host's own teaching
  // context would silently vanish under the layer if we didn't carry it over.
  const instruction = (activity.spec as { instruction?: InstructionPanelSpec } | null)?.instruction;

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
        <ByocWaiting title={t('byoc.generating')} hint={t('byoc.generatingHint')} />
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

      {phase === 'fallback' && spec.fallback && (
        <>
          <p className="text-sm text-muted-foreground" data-testid="byoc-fallback-note">
            {t('byoc.fallbackNote')}
          </p>
          <div className="mt-4">
            <ByocTree tree={spec.fallback} reveal={reveal} done={isDone} onComplete={onComplete} />
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
              onComplete={onComplete}
            />
          </div>
        </>
      )}
    </ActivityShell>
  );
}
