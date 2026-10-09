import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { useActiveLiveClass, useNextScheduledClass } from '@/hooks/useLiveClass';
import { useIteraIdentity } from '@/hooks/useIteraIdentity';
import { formatScheduledAt } from '@/utils/formatScheduledAt';

/**
 * Next SCHEDULED class of the tenant, as a row of the dashboard's live card: date block, what it is and
 * when. Hidden once a class is actually live (the live block takes over); the instructor gets a shortcut
 * to the professor surface.
 */
export function NextScheduledClassBlock({ describeLesson }: { describeLesson?: (lessonId: string) => string | null }) {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const identity = useIteraIdentity();
  const { data: active } = useActiveLiveClass();
  const { data: scheduled } = useNextScheduledClass();

  if (active || !scheduled) return null;
  const isInstructor = scheduled.instructorId === identity.userId;
  const at = scheduled.scheduledAt ? new Date(scheduled.scheduledAt) : null;
  const tag = locale === 'pt' ? 'pt-BR' : 'en-US';
  const weekday = at ? new Intl.DateTimeFormat(tag, { weekday: 'short' }).format(at).replace('.', '').toUpperCase() : '';
  const day = at ? String(at.getDate()).padStart(2, '0') : '';
  const title = describeLesson?.(scheduled.lessonId) ?? t('dash.live.untitled');

  return (
    <section data-testid="next-scheduled-block" className="flex min-h-16 items-center gap-3.5 border-t border-[#262320] py-2.5">
      <span className="flex w-14 flex-none flex-col items-center rounded-lg bg-[#E0A86F] py-1.5 text-[#0A0908]">
        <span className="[font:700_10px_JetBrains_Mono]">{weekday}</span>
        <span className="[font:700_24px/1_'Barlow_Condensed']">{day}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate [font:600_15px_Inter] text-[#F4EDE2]">{title}</span>
        <span className="[font:500_12px_JetBrains_Mono] text-[#A0978A]" data-testid="next-scheduled-time">
          {formatScheduledAt(scheduled.scheduledAt, locale)}
        </span>
      </span>
      {isInstructor && (
        <button
          type="button"
          onClick={() => navigate('/live/instructor')}
          data-testid="next-scheduled-manage"
          className="h-11 shrink-0 rounded-xl border border-[#2E2A25] px-4 [font:500_13px_JetBrains_Mono] text-[#F4EDE2] hover:border-[#E0A86F]"
        >
          {t('live.scheduled.manageCta')}
        </button>
      )}
    </section>
  );
}
