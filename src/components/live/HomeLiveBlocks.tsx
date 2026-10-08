import { useNavigate } from 'react-router-dom';
import { Radio } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useActiveLiveClass } from '@/hooks/useLiveClass';
import { useIteraIdentity } from '@/hooks/useIteraIdentity';
import { liveLearnerHref } from '@/utils/liveLearnerView';
import { NextScheduledClassBlock } from './NextScheduledClassBlock';

/**
 * The live part of the dashboard, the `live` slot of the universal home screen on the web: the class in
 * progress, or else the next scheduled one. Each block renders nothing when it has nothing to say.
 */
export function HomeLiveBlocks() {
  return (
    <>
      <LiveClassBlock />
      <NextScheduledClassBlock />
    </>
  );
}

/**
 * Dedicated live-class banner shown between the hero and the programs grid.
 * Returns null when no class is active — no layout space consumed.
 *
 * - Instructor: navigates to /live/instructor (control panel re-entry).
 * - Student:    navigates to /live/:id (join the session).
 */
function LiveClassBlock() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const identity = useIteraIdentity();
  const { data: active } = useActiveLiveClass();

  if (!active) return null;

  const isInstructor = active.instructorId === identity.userId;
  const target = isInstructor ? '/live/instructor' : `/live/${active.id}`;
  const ctaLabel = isInstructor ? t('live.block.returnCta') : t('live.block.joinCta');
  const ctaTestId = isInstructor ? 'live-class-return' : 'live-class-join';

  return (
    <section data-testid="live-class-block">
      <div className="rounded-3xl border border-clay/50 bg-clay/5 p-6 flex items-center justify-between gap-4">
        {/* left: pulse indicator + label + subtitle */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="relative shrink-0">
            <span className="block w-3 h-3 rounded-full bg-red-500 animate-ping absolute" />
            <span className="block w-3 h-3 rounded-full bg-red-500" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-wider text-red-500 font-bold">
              {t('live.badge.label')}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{t('live.block.subtitle')}</p>
          </div>
        </div>

        {/* right: CTA */}
        <div className="shrink-0 flex items-center gap-2">
          {/* O professor às vezes quer VER a aula como o aluno vê (conferir um
              exercício, acompanhar de outro dispositivo). Sem isso o redirect
              do /live/:id o devolve pro console toda vez. */}
          {isInstructor && (
            <button
              type="button"
              onClick={() => navigate(liveLearnerHref(active.id))}
              data-testid="live-class-join-as-learner"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-border text-sm font-medium text-foreground hover:border-red-500/50 transition-colors"
            >
              {t('live.block.joinAsLearner')}
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate(target)}
            data-testid={ctaTestId}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
          >
            <Radio className="w-4 h-4" />
            {ctaLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
