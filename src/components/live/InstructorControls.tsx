import { Play, ChevronLeft, ChevronRight, Eye, RotateCcw } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveTimerControls } from '@/components/live/LiveTimerControls';

interface InstructorControlsProps {
  /** Reception (pointer not set yet) — only "Begin" is shown. */
  inReception: boolean;
  answeredCount: number;
  presentCount: number;
  busy: boolean;
  canPrev: boolean;
  canNext: boolean;
  timerRunning: boolean;
  /** The current activity's answer is already revealed to the class. */
  revealed: boolean;
  /** Pre-set lesson timer duration (seconds); 0 = the lesson has no timer. */
  timerSeconds: number;
  onBegin: () => void;
  onPrev: () => void;
  onNext: () => void;
  onStartTimer: (seconds: number) => void;
  onStopTimer: () => void;
  onReveal: () => void;
  onReset: () => void;
}

/**
 * The professor's flow controls, rendered as the top SECTION of the sidebar
 * (there is no bottom bar): begin the class, move prev/next through the
 * activities, and run the shared timer.
 */
export function InstructorControls({
  inReception,
  answeredCount,
  presentCount,
  busy,
  canPrev,
  canNext,
  timerRunning,
  revealed,
  timerSeconds,
  onBegin,
  onPrev,
  onNext,
  onStartTimer,
  onStopTimer,
  onReveal,
  onReset,
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
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={!canPrev || busy}
          data-testid="instructor-prev"
          aria-label={t('live.instructor.control.prev')}
          className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-full border border-border bg-background text-foreground hover:border-clay/50 transition-colors disabled:opacity-40"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex-1 flex items-center justify-center leading-none">
          {presentCount > 0 && (
            <span
              className={`text-xs font-mono tabular-nums ${allAnswered ? 'text-menta' : 'text-muted-foreground'}`}
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
          className={`inline-flex items-center gap-1.5 h-10 pl-4 pr-3 shrink-0 rounded-full bg-clay text-white text-sm font-medium hover:bg-clay/90 transition-colors disabled:opacity-40 ${
            allAnswered && canNext ? 'ring-2 ring-menta ring-offset-2 ring-offset-card animate-pulse' : ''
          }`}
        >
          {t('live.instructor.control.next')}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {timerSeconds > 0 && (
        <LiveTimerControls
          running={timerRunning}
          seconds={timerSeconds}
          onStart={onStartTimer}
          onStop={onStopTimer}
        />
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onReveal}
          disabled={busy || revealed}
          data-testid="instructor-reveal"
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-full border border-border bg-background text-sm text-foreground hover:border-clay/50 transition-colors disabled:opacity-40"
        >
          <Eye className="w-3.5 h-3.5" /> {t('live.instructor.control.reveal')}
        </button>
        <button
          onClick={onReset}
          disabled={busy}
          data-testid="instructor-reset"
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-full border border-border bg-background text-sm text-foreground hover:border-clay/50 transition-colors disabled:opacity-40"
        >
          <RotateCcw className="w-3.5 h-3.5" /> {t('live.instructor.control.reset')}
        </button>
      </div>
    </div>
  );
}
