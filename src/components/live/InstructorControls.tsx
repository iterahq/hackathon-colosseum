import { Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveTimerControls } from '@/components/live/LiveTimerControls';

interface InstructorControlsProps {
  /** Reception (pointer not set yet) — only "Begin" is shown. */
  inReception: boolean;
  activityIndex: number;
  activityCount: number;
  answeredCount: number;
  presentCount: number;
  busy: boolean;
  canPrev: boolean;
  canNext: boolean;
  timerRunning: boolean;
  onBegin: () => void;
  onPrev: () => void;
  onNext: () => void;
  onStartTimer: (seconds: number) => void;
  onStopTimer: () => void;
}

/**
 * The professor's flow controls, rendered as the top SECTION of the sidebar
 * (there is no bottom bar): begin the class, move prev/next through the
 * activities, and run the shared timer.
 */
export function InstructorControls({
  inReception,
  activityIndex,
  activityCount,
  answeredCount,
  presentCount,
  busy,
  canPrev,
  canNext,
  timerRunning,
  onBegin,
  onPrev,
  onNext,
  onStartTimer,
  onStopTimer,
}: InstructorControlsProps) {
  const { t } = useI18n();
  const allAnswered = presentCount > 0 && answeredCount >= presentCount;

  if (inReception) {
    return (
      <div className="p-5" data-testid="instructor-controls">
        <button
          onClick={onBegin}
          disabled={busy}
          data-testid="instructor-begin-btn"
          className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-full bg-clay text-white font-medium hover:bg-clay/90 transition-colors disabled:opacity-50"
        >
          <Play className="w-4 h-4" /> {t('live.instructor.control.begin')}
        </button>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-3" data-testid="instructor-controls">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onPrev}
          disabled={!canPrev || busy}
          data-testid="instructor-prev"
          aria-label={t('live.instructor.control.prev')}
          className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-border bg-background text-foreground hover:border-clay/50 transition-colors disabled:opacity-40"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center leading-none">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono tabular-nums">
            {activityIndex + 1}/{activityCount}
          </span>
          {presentCount > 0 && (
            <span
              className={`mt-0.5 text-[10px] font-mono tabular-nums ${allAnswered ? 'text-menta' : 'text-muted-foreground'}`}
              data-testid="instructor-answered-count"
            >
              ✓ {answeredCount}/{presentCount}
            </span>
          )}
        </div>

        <button
          onClick={onNext}
          disabled={!canNext || busy}
          data-testid="instructor-next"
          data-ready={allAnswered ? 'true' : 'false'}
          aria-label={t('live.instructor.control.next')}
          className={`inline-flex items-center justify-center w-10 h-10 rounded-full bg-clay text-white hover:bg-clay/90 transition-colors disabled:opacity-40 ${
            allAnswered && canNext ? 'ring-2 ring-menta ring-offset-2 ring-offset-card animate-pulse' : ''
          }`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <LiveTimerControls running={timerRunning} onStart={onStartTimer} onStop={onStopTimer} />
    </div>
  );
}
