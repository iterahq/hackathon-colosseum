import { Clock3 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { formatMmss } from '@/utils/formatMmss';
import type { ClassReportParticipant } from '@/types/liveClass';

export function ReportRanking({ participants }: { participants: ClassReportParticipant[] }) {
  const { t } = useI18n();
  return (
    <section className="mb-8">
      <h2 className="font-display text-foreground mb-3">{t('live.report.ranking.title')}</h2>
      {participants.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="report-empty">
          {t('live.report.empty')}
        </p>
      ) : (
        <div
          className="rounded-2xl border border-border bg-card divide-y divide-border"
          data-testid="report-ranking"
        >
          {participants.map((p, i) => (
            <div key={p.userId} className="flex items-center gap-3 px-4 py-3">
              <span className="text-sm font-mono text-muted-foreground w-8 shrink-0">
                {i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`}
              </span>
              {p.avatarUrl ? (
                <img src={p.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
              ) : (
                <span className="w-7 h-7 rounded-full bg-muted text-muted-foreground text-xs flex items-center justify-center shrink-0">
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="text-sm text-foreground flex-1 min-w-0 truncate">{p.name}</span>
              <span className="text-xs text-menta shrink-0">
                {t('live.report.ranking.score', {
                  correct: String(p.correctCount),
                  answered: String(p.answeredCount),
                })}
              </span>
              {p.totalMs > 0 && (
                <span className="text-xs text-muted-foreground shrink-0 inline-flex items-center gap-1">
                  <Clock3 className="w-3.5 h-3.5" />
                  {formatMmss(p.totalMs / 1000)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
