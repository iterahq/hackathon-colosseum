import { useI18n } from '@/i18n';
import type { ClassReport } from '@/types/liveClass';

export function ReportSummary({ totals }: { totals: ClassReport['totals'] }) {
  const { t } = useI18n();
  // Every figure here is COHORT-ONLY — guests are excluded from participants,
  // answers and correctPct (ADR-4). The guest chip appears only when guests were
  // actually present, and exists so their absence from the other three numbers
  // is visible rather than silent.
  const chips = [
    { value: String(totals.participants), label: t('live.report.summary.participants') },
    { value: String(totals.answers), label: t('live.report.summary.answers') },
    { value: `${totals.correctPct}%`, label: t('live.report.summary.correct') },
    ...(totals.guests > 0
      ? [{ value: String(totals.guests), label: t('live.report.summary.guests') }]
      : []),
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8" data-testid="report-summary">
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
