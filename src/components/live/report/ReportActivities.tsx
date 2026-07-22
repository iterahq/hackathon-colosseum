import { CheckCircle2, Circle, XCircle } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { ClassReportActivityStat } from '@/types/liveClass';

export function ReportActivities({
  stats,
  labels,
}: {
  stats: ClassReportActivityStat[];
  labels: Map<string, string>;
}) {
  const { t } = useI18n();
  if (stats.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="font-display text-foreground mb-3">{t('live.report.activities.title')}</h2>
      <div
        className="rounded-2xl border border-border bg-card divide-y divide-border"
        data-testid="report-activities"
      >
        {stats.map((s, i) => (
          <div key={s.activityId} className="flex items-center gap-3 px-4 py-3">
            <span className="text-xs font-mono text-muted-foreground w-6 shrink-0">{i + 1}.</span>
            <span className="text-sm text-foreground flex-1 min-w-0 truncate">
              {labels.get(s.activityId) ??
                t('live.report.activities.fallback', { n: String(i + 1) })}
            </span>
            <span className="text-xs text-menta shrink-0 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {s.correct}
            </span>
            <span className="text-xs text-clay shrink-0 inline-flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" />
              {s.wrong}
            </span>
            <span className="text-xs text-muted-foreground shrink-0 inline-flex items-center gap-1">
              <Circle className="w-3.5 h-3.5" />
              {s.unanswered}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
