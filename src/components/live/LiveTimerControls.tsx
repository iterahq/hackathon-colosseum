import { Timer as TimerIcon, Square } from 'lucide-react';
import { useI18n } from '@/i18n';
import { formatMmss } from '@/utils/formatMmss';

const PRESET_SECONDS = [30, 60, 120, 300];

interface LiveTimerControlsProps {
  running: boolean;
  onStart: (seconds: number) => void;
  onStop: () => void;
}

export function LiveTimerControls({ running, onStart, onStop }: LiveTimerControlsProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="live-timer-controls">
      <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground font-mono">
        <TimerIcon className="w-3.5 h-3.5" /> {t('live.timer.label')}
      </span>
      {PRESET_SECONDS.map((s) => (
        <button
          key={s}
          onClick={() => onStart(s)}
          data-testid={`live-timer-preset-${s}`}
          className="h-8 px-3 rounded-full border border-border bg-background text-xs font-mono font-medium text-foreground hover:border-clay/50 transition-colors"
        >
          {formatMmss(s)}
        </button>
      ))}
      {running && (
        <button
          onClick={onStop}
          data-testid="live-timer-stop"
          className="h-8 px-3 rounded-full border border-destructive/40 bg-destructive/10 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors inline-flex items-center gap-1"
        >
          <Square className="w-3 h-3" /> {t('live.timer.stop')}
        </button>
      )}
    </div>
  );
}
