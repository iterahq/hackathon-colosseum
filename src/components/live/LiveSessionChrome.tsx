import { X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveSoundToggle } from '@/components/live/LiveSoundToggle';

interface LiveSessionChromeProps {
  progressPct: number;
  connected: boolean;
  presenceCount: number;
  ended: boolean;
  /** Current activity position (0-based) + total, for the header N/M cue. */
  activityIndex?: number;
  activityCount?: number;
  onClose: () => void;
}

/**
 * The immersive top chrome of a live class — progress bar, close, the LIVE
 * pill + presence count, a mute toggle and the decorative hearts. Shared by the
 * learner surface AND the instructor surface so the professor sees the SAME
 * frame the students do (screen-share parity); the professor just adds controls
 * around this, never a different shell.
 */
export function LiveSessionChrome({
  progressPct,
  connected,
  presenceCount,
  ended,
  activityIndex = 0,
  activityCount = 0,
  onClose,
}: LiveSessionChromeProps) {
  const { t } = useI18n();
  const showPosition = !ended && activityCount > 0 && activityIndex >= 0;

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
        className="absolute top-2.5 left-3 md:left-4 w-9 h-9 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      <div
        className="absolute top-2.5 left-1/2 -translate-x-1/2 h-9 flex items-center gap-2"
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
            className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full border text-xs font-medium ${
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
            {t('live.badge.label')}
            <span className="opacity-70">· {presenceCount}</span>
          </span>
        )}
        {showPosition && (
          <span
            className="inline-flex items-center px-2.5 h-8 rounded-full border border-border bg-card text-xs font-mono tabular-nums text-muted-foreground"
            data-testid="live-position"
          >
            {activityIndex + 1}/{activityCount}
          </span>
        )}
      </div>

      <div className="absolute top-2.5 right-3 md:right-4 h-9 flex items-center gap-3">
        {!ended && <LiveSoundToggle compact />}
      </div>
    </header>
  );
}
