import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/i18n';

interface LiveSessionChromeProps {
  progressPct: number;
  connected: boolean;
  presenceCount: number;
  ended: boolean;
  /** Current activity position (0-based) + total, for the N/M cue. */
  activityIndex?: number;
  activityCount?: number;
  /** A prominent running timer, rendered beside the LIVE pill (top-center). */
  timerSlot?: ReactNode;
  /** Learner hand-raise toggle, pinned beside the timer (top-center). */
  handSlot?: ReactNode;
  onClose: () => void;
  /** Confirmação ancorada sob o X. O chrome só posiciona; quem decide é a página. */
  closeConfirm?: ReactNode;
}

/**
 * The immersive top chrome of a live class — progress bar, close, the LIVE
 * pill + presence count and position cue. Shared by the
 * learner surface AND the instructor surface so the professor sees the SAME
 * frame the students do (screen-share parity); the professor just adds controls
 * around this, never a different shell.
 */
export function LiveSessionChrome({
  progressPct,
  connected,
  presenceCount,
  ended,
  activityIndex,
  activityCount,
  timerSlot,
  handSlot,
  onClose,
  closeConfirm,
}: LiveSessionChromeProps) {
  const { t } = useI18n();
  const showPosition =
    typeof activityIndex === 'number' && activityIndex >= 0 && (activityCount ?? 0) > 0;

  return (
    <header className="relative z-30">
      <div
        className="h-1 w-full bg-muted"
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        data-testid="live-progress"
      >
        <div
          className="h-full bg-clay transition-[width] duration-300"
          style={{ width: `${progressPct}%` }}
          data-testid="live-progress-fill"
        />
      </div>

      <button
        onClick={onClose}
        aria-label={t('common.back')}
        data-testid="live-close"
        className="absolute top-2.5 left-3 md:left-4 z-10 w-9 h-9 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      {closeConfirm && (
        <div className="absolute top-12 left-3 md:left-4 z-40">{closeConfirm}</div>
      )}

      {/* Sem teto este grupo cresce por cima do X — que é pintado antes — e
          engole o botão de sair a 360px. O teto reserva 3rem de cada lado. */}
      <div
        className="absolute top-2.5 left-1/2 -translate-x-1/2 h-10 sm:h-9 flex items-center gap-2 max-w-[calc(100%_-_6rem)] min-w-0"
        data-testid="live-indicator"
        data-status={ended ? 'ended' : 'live'}
      >
        {ended ? (
          <span
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full border border-border bg-card text-xs font-medium text-muted-foreground"
            data-testid="live-indicator-ended"
          >
            <span className="inline-flex h-2 w-2 rounded-full bg-muted-foreground" aria-hidden="true" />
            {t('live.status.ended')}
          </span>
        ) : (
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 px-2 sm:px-3 h-8 rounded-full border text-xs font-medium ${
              connected
                ? 'border-clay/50 bg-clay/10 text-clay'
                : 'border-border bg-card text-muted-foreground'
            }`}
          >
            <span className="relative flex h-2 w-2" aria-hidden="true">
              {connected && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-clay opacity-75" />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${connected ? 'bg-clay' : 'bg-muted-foreground'}`} />
            </span>
            <span className="sr-only sm:not-sr-only">{t('live.badge.label')}</span>
            {/* Presence count hides on phones so pill + prominent timer never
                overflow onto the close button / sound toggle; N/M stays. */}
            <span className="opacity-70 hidden sm:inline">· {presenceCount}</span>
            {showPosition && (
              <span className="opacity-70 font-mono tabular-nums" data-testid="live-position-chrome">
                · {(activityIndex as number) + 1}/{activityCount}
              </span>
            )}
          </span>
        )}
        {!ended && timerSlot}
        {!ended && handSlot}
      </div>
    </header>
  );
}
