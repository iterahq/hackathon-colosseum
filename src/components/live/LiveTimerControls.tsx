import { Play, Square } from 'lucide-react';
import { useI18n } from '@/i18n';
import { formatMmss } from '@/utils/formatMmss';

interface LiveTimerControlsProps {
  running: boolean;
  /** The pre-defined duration for this lesson (set at class creation). */
  seconds: number;
  onStart: (seconds: number) => void;
  onStop: () => void;
}

/**
 * Instructor timer control — a SINGLE start button using the lesson's pre-set
 * duration (per Tainan: the professor doesn't pick a time mid-class, just
 * starts). Turns into "stop" while running.
 */
export function LiveTimerControls({ running, seconds, onStart, onStop }: LiveTimerControlsProps) {
  const { t } = useI18n();
  return (
    <div data-testid="live-timer-controls">
      {running ? (
        <button
          onClick={onStop}
          data-testid="live-timer-stop"
          className="w-full inline-flex items-center justify-center gap-1.5 h-10 rounded-full border border-destructive/40 bg-destructive/10 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors"
        >
          <Square className="w-3.5 h-3.5" /> {t('live.timer.stop')}
        </button>
      ) : (
        <button
          onClick={() => onStart(seconds)}
          data-testid="live-timer-start"
          className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-full border border-border bg-background text-sm font-medium text-foreground hover:border-clay/50 transition-colors"
        >
          <Play className="w-4 h-4" /> {t('live.timer.start', { time: formatMmss(seconds) })}
        </button>
      )}
    </div>
  );
}
