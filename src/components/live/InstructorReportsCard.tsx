import { Link } from 'react-router-dom';
import { ChevronRight, FileBarChart2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { ClassSession } from '@/types/liveClass';

const MAX_ROWS = 8;

export function InstructorReportsCard({ sessions }: { sessions: ClassSession[] }) {
  const { t } = useI18n();
  const ended = sessions
    .filter((s) => s.status === 'ended' && s.startedAt)
    .slice(0, MAX_ROWS);

  return (
    <section className="mt-8" data-testid="instructor-reports">
      <div className="flex items-center gap-2 mb-1">
        <FileBarChart2 className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-display text-foreground">{t('live.instructor.reports.title')}</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{t('live.instructor.reports.subtitle')}</p>
      {ended.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="instructor-reports-empty">
          {t('live.instructor.reports.empty')}
        </p>
      ) : (
        <div className="rounded-2xl border border-border bg-card divide-y divide-border">
          {ended.map((s) => {
            const d = new Date(s.startedAt as string);
            return (
              <Link
                key={s.id}
                to={`/live/instructor/report/${s.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                data-testid="instructor-report-row"
              >
                <span className="text-sm text-foreground flex-1">
                  {d.toLocaleDateString()}{' '}
                  {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('live.instructor.reports.open')}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
