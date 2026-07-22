import { useI18n } from '@/i18n';
import type { ClassReport } from '@/types/liveClass';

export function ReportSummary({ totals }: { totals: ClassReport['totals'] }) {
  const { t } = useI18n();
  const chips = [
    { value: String(totals.participants), label: t('live.report.summary.participants') },
    { value: String(totals.answers), label: t('live.report.summary.answers') },
    { value: `${totals.correctPct}%`, label: t('live.report.summary.correct') },
  ];
  return (
    <div className="grid grid-cols-3 gap-3 mb-8" data-testid="report-summary">
      {chips.map((c) => (
        <div
          key={c.label}
          className="rounded-2xl border border-border bg-card px-4 py-4 text-center"
        >
          <div className="font-display text-2xl font-bold text-foreground">{c.value}</div>
          <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
