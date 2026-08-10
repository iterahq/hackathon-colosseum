import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/i18n';

interface LiveSessionChromeProps {
  progressPct: number;
  ended: boolean;
  /**
   * Kept for the `data-*` on the indicator so a test/analytics reader can still
   * tell WHERE in the flow a class was, even though the chrome no longer paints
   * the N/M cue (`LiveActivityStepper`, in the sidebar, is the one place for it).
   */
  activityIndex?: number;
  activityCount?: number;
  /** A prominent running timer, pinned to the RIGHT (Tainan 2026-08-06). */
  timerSlot?: ReactNode;
  /** Learner hand-raise toggle, rendered beside the timer. */
  handSlot?: ReactNode;
  onClose: () => void;
  /** Confirmação ancorada sob o X. O chrome só posiciona; quem decide é a página. */
  closeConfirm?: ReactNode;
}

/**
 * The immersive top chrome of a live class — progress bar, close, the ended
 * indicator, timer + hand. Shared by the learner surface AND the instructor
 * surface so the professor sees the SAME frame the students do (screen-share
 * parity); the professor just adds controls around this, never a different shell.
 *
 * ⚠️ It no longer carries a LIVE pill with presence count and position. Both
 * were already on screen — the roster IS the presence count and
 * `LiveActivityStepper` IS the N/M cue — and in the first class with real
 * students the duplicate read as chrome noise competing with the stage
 * ("o outro badge do centro ali tirar (redundante)", Tainan 2026-08-06). The
 * `connected` state now surfaces only through `LiveReconnectBanner`, which says
 * what a dot cannot: what the learner should do about it.
 */
export function LiveSessionChrome({
  progressPct,
  ended,
  activityIndex,
  activityCount,
  timerSlot,
  handSlot,
  onClose,
  closeConfirm,
}: LiveSessionChromeProps) {
  const { t } = useI18n();

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
        data-activity-index={typeof activityIndex === 'number' ? activityIndex + 1 : undefined}
        data-activity-count={activityCount}
      >
        {ended && (
          <span
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full border border-border bg-card text-xs font-medium text-muted-foreground"
            data-testid="live-indicator-ended"
          >
            <span className="inline-flex h-2 w-2 rounded-full bg-muted-foreground" aria-hidden="true" />
            {t('live.status.ended')}
          </span>
        )}
      </div>

      {/* Timer + hand to the RIGHT: in the centre the countdown sat on top of the
          stage and read as part of the activity. */}
      {!ended && (timerSlot || handSlot) && (
        <div className="absolute top-2.5 right-3 md:right-4 h-9 flex items-center gap-2" data-testid="live-chrome-right">
          {timerSlot}
          {handSlot}
        </div>
      )}
    </header>
  );
}
