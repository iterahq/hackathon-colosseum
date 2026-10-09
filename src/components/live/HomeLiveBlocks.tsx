import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { useActiveLiveClass } from '@/hooks/useLiveClass';
import { useIteraIdentity } from '@/hooks/useIteraIdentity';
import { useShellSurface } from '@/hooks/useShellSurface';
import { liveLearnerHref } from '@/utils/liveLearnerView';
import { NextScheduledClassBlock } from './NextScheduledClassBlock';

/**
 * The live part of the dashboard, the `live` slot of the universal home screen on the web: the class in
 * progress, or else the next scheduled one. Each block renders nothing when it has nothing to say.
 */
export function HomeLiveBlocks({ describeLesson }: { describeLesson?: (lessonId: string) => string | null }) {
  return (
    <>
      <LiveClassBlock />
      <NextScheduledClassBlock describeLesson={describeLesson} />
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
  const surface = useShellSurface();

  if (!active) return null;

  const inShell = surface === 'shell';
  const isInstructor = active.instructorId === identity.userId;
  const target = isInstructor ? '/live/instructor' : `/live/${active.id}`;
  const ctaLabel = isInstructor ? t('live.block.returnCta') : t('live.block.joinCta');
  const ctaTestId = isInstructor ? 'live-class-return' : 'live-class-join';

  return (
    <section data-testid="live-class-block" className="flex flex-col gap-3 border-t border-[#262320] pt-3">
      <span className="flex items-center gap-2 [font:700_12px_JetBrains_Mono] tracking-[.08em] text-[#E0A86F]">
        <span className="relative block h-2.5 w-2.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#E5484D]" />
          <span className="absolute inset-0 rounded-full bg-[#E5484D]" />
        </span>
        {t('dash.live.now')}
      </span>
      {inShell ? (
        <p className="[font:500_12px_JetBrains_Mono] text-[#A0978A]">{t('shell.liveUnavailable.body', { host: window.location.host })}</p>
      ) : (
        <p className="truncate [font:600_15px_Inter] text-[#F4EDE2]">{t('live.block.subtitle')}</p>
      )}
      {surface === 'web' && (
        <div className="flex flex-wrap items-center gap-2">
          {isInstructor && (
            <button
              type="button"
              onClick={() => navigate(liveLearnerHref(active.id))}
              data-testid="live-class-join-as-learner"
              className="h-11 rounded-xl border border-[#2E2A25] px-4 [font:500_13px_JetBrains_Mono] text-[#F4EDE2] hover:border-[#E0A86F]"
            >
              {t('live.block.joinAsLearner')}
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate(target)}
            data-testid={ctaTestId}
            className="h-14 flex-1 rounded-xl border-0 border-b-[5px] border-b-[#A87440] bg-[#E0A86F] px-4 [font:700_24px_'Barlow_Condensed'] text-[#0A0908] transition-transform duration-75 active:translate-y-1 active:border-b-[1px]"
          >
            {ctaLabel}
          </button>
        </div>
      )}
    </section>
  );
}
