import { Radio, CheckCircle2, XCircle, Circle, CircleDot } from 'lucide-react';
import { useI18n } from '@/i18n';
import { formatMmss } from '@/utils/formatMmss';
import type { ClassAnswerer } from '@/types/liveClass';

interface LiveAnswerersCardProps {
  answerers: ClassAnswerer[];
  /**
   * Hide right/wrong from peers (student view): show only answered vs pending,
   * never who got it wrong. The instructor view keeps the full correctness.
   */
  hideCorrectness?: boolean;
}

export function LiveAnswerersCard({ answerers, hideCorrectness = false }: LiveAnswerersCardProps) {
  const { t } = useI18n();
  const answeredCount = hideCorrectness
    ? answerers.filter((a) => a.state !== 'pending').length
    : answerers.filter((a) => a.state === 'done').length;

  return (
    <div className="rounded-3xl border border-border bg-card p-5" data-testid="live-answerers-card">
      <div className="flex items-center gap-2 mb-3">
        <Radio className="w-4 h-4 text-clay" />
        <h3 className="font-display text-foreground text-sm">{t('live.instructor.done.title')}</h3>
        <span className="ml-auto font-mono text-sm tabular-nums text-clay" data-testid="live-answerers-count">
          {answeredCount}/{answerers.length}
        </span>
      </div>
      {answerers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('live.instructor.done.empty')}</p>
      ) : (
        <ul className="space-y-1.5 max-h-64 overflow-y-auto" data-testid="live-answerers-list">
          {answerers.map((a) => (
            <li key={a.userId} className="flex items-center gap-2 text-sm" data-state={a.state}>
              {hideCorrectness ? (
                a.state === 'pending' ? (
                  <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <CircleDot className="w-4 h-4 text-menta flex-shrink-0" />
                )
              ) : a.state === 'done' ? (
                <CheckCircle2 className="w-4 h-4 text-menta flex-shrink-0" />
              ) : a.state === 'wrong' ? (
                <XCircle className="w-4 h-4 text-clay flex-shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
              <span className={a.state === 'pending' ? 'text-muted-foreground' : 'text-foreground'}>{a.name}</span>
              {!hideCorrectness && a.state !== 'pending' && typeof a.elapsedMs === 'number' && (
                <span
                  className="ml-auto font-mono text-xs tabular-nums text-muted-foreground"
                  data-testid="live-answerer-elapsed"
                >
                  {formatMmss(Math.round(a.elapsedMs / 1000))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
