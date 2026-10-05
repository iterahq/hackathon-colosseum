import { useNavigate } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useActiveLiveClass, useNextScheduledClass } from '@/hooks/useLiveClass';
import { useIteraIdentity } from '@/hooks/useIteraIdentity';
import { formatScheduledAt } from '@/utils/formatScheduledAt';

/**
 * "Próxima aula" card — surfaces the next SCHEDULED class to tenant learners so
 * they know when to come back. Hidden once a class is actually live (the live
 * block takes over); the instructor gets a shortcut to the professor surface.
 */
export function NextScheduledClassBlock() {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const identity = useIteraIdentity();
  const { data: active } = useActiveLiveClass();
  const { data: scheduled } = useNextScheduledClass();

  if (active || !scheduled) return null;
  const isInstructor = scheduled.instructorId === identity.userId;

  return (
    <section data-testid="next-scheduled-block">
      <div className="rounded-3xl border border-border bg-card p-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-clay/10 border border-clay/30 flex items-center justify-center text-clay shrink-0">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-wider text-clay font-bold">
              {t('live.scheduled.label')}
            </p>
            <p className="text-sm text-foreground mt-0.5 truncate" data-testid="next-scheduled-time">
              {formatScheduledAt(scheduled.scheduledAt, locale)}
            </p>
          </div>
        </div>

        {isInstructor && (
          <button
            type="button"
            onClick={() => navigate('/live/instructor')}
            data-testid="next-scheduled-manage"
            className="shrink-0 inline-flex items-center gap-2 h-10 px-5 rounded-full border border-border text-sm font-medium text-foreground hover:border-clay/50 transition-colors"
          >
            {t('live.scheduled.manageCta')}
          </button>
        )}
      </div>
    </section>
  );
}
