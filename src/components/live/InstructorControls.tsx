import { Play, ChevronLeft, ChevronRight, Eye, MonitorUp } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveTimerControls } from '@/components/live/LiveTimerControls';
import { AddTimeControl } from '@/components/live/AddTimeControl';

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
  /** The current activity HAS an answer — content kinds hide the Reveal button. */
  canReveal: boolean;
  /** Pre-set lesson timer duration (seconds); 0 = the lesson has no timer. */
  timerSeconds: number;
  onBegin: () => void;
  onPrev: () => void;
  onNext: () => void;
  onStartTimer: (seconds: number) => void;
  onStopTimer: () => void;
  /**
   * Add `seconds` to the shared countdown. When running it extends the time
   * left; when stopped it grows the next start's duration. Same channel as the
   * timer itself — the parent wires it to a re-broadcast.
   */
  onAddTime: (seconds: number) => void;
  onReveal: () => void;
  /** The professor's own screen is the one on the projector right now. */
  selfStaged: boolean;
  /** Puts the professor's own work on the class projector (and takes it off). */
  onToggleSelfStage: () => void;
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
  canReveal,
  timerSeconds,
  onBegin,
  onPrev,
  onNext,
  onStartTimer,
  onStopTimer,
  onAddTime,
  onReveal,
  selfStaged,
  onToggleSelfStage,
}: InstructorControlsProps) {
  const { t } = useI18n();
  // The professor has full authority to advance whenever they want — the "Next"
  // button fires immediately, even with learners still pending (no confirm gate).
  const allAnswered = presentCount > 0 && answeredCount >= presentCount;

  if (inReception) {
    return (
      <div className="p-5" data-testid="instructor-controls">
        <button
          onClick={onBegin}
          disabled={busy}
          data-testid="instructor-begin-btn"
          className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-full bg-evergreen text-obsidiana font-display font-semibold text-[15px] uppercase tracking-wide hover:bg-evergreen-hi transition-colors disabled:opacity-50"
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
          className="inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-full border border-border bg-background text-foreground hover:border-evergreen/40 transition-colors disabled:opacity-35"
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
          className={`inline-flex items-center gap-1.5 h-11 pl-5 pr-4 shrink-0 rounded-full bg-evergreen text-obsidiana font-display font-semibold text-[15px] uppercase tracking-wide hover:bg-evergreen-hi transition-colors disabled:opacity-40 ${
            allAnswered && canNext ? 'ring-2 ring-evergreen-hi/70 ring-offset-2 ring-offset-card' : ''
          }`}
        >
          {t('live.instructor.control.next')}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {timerSeconds > 0 && (
        <div className="flex items-center gap-2">
          {/* The start/stop button keeps the row's width; the add-time popover
              trigger is the icon-only affordance beside it. */}
          <div className="flex-1 min-w-0">
            <LiveTimerControls
              running={timerRunning}
              seconds={timerSeconds}
              onStart={onStartTimer}
              onStop={onStopTimer}
            />
          </div>
          <AddTimeControl running={timerRunning} onAddTime={onAddTime} />
        </div>
      )}

      <button
        onClick={onToggleSelfStage}
        disabled={busy}
        aria-pressed={selfStaged}
        data-testid="instructor-self-stage"
        className={`w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-full border text-sm transition-colors disabled:opacity-40 ${
          selfStaged
            ? 'border-evergreen bg-evergreen-soft text-evergreen-hi'
            : 'border-border bg-background text-foreground hover:border-evergreen/40'
        }`}
      >
        <MonitorUp className="w-3.5 h-3.5" />{' '}
        {selfStaged
          ? t('live.instructor.control.selfStageOff')
          : t('live.instructor.control.selfStage')}
      </button>

      {canReveal && (
        <button
          onClick={onReveal}
          disabled={busy || revealed}
          data-testid="instructor-reveal"
          className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-full border border-border bg-background text-sm text-foreground hover:border-evergreen/40 transition-colors disabled:opacity-40"
        >
          <Eye className="w-3.5 h-3.5" /> {t('live.instructor.control.reveal')}
        </button>
      )}
    </div>
  );
}
