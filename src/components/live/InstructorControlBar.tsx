import { Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveTimerControls } from '@/components/live/LiveTimerControls';

interface InstructorControlBarProps {
  /** Reception (pointer not set yet) — only "Begin" is shown. */
  inReception: boolean;
  activityIndex: number;
  activityCount: number;
  /** Present learners who've answered the current activity (advance-now cue). */
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
 * The instructor's fixed presenter toolbar — the ONLY thing that separates the
 * professor's screen from a learner's (per Tainan: same stage, controls around
 * it). Drives the flow (begin / prev · next / timer); the class-management
 * actions (share link, end) live in the sidebar, not here.
 */
export function InstructorControlBar({
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
}: InstructorControlBarProps) {
  const { t } = useI18n();
  // Everyone present has answered → nudge the professor to advance.
  const allAnswered = presentCount > 0 && answeredCount >= presentCount;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      data-testid="instructor-control-bar"
    >
      <div className="mx-auto max-w-5xl px-4 md:px-6 min-h-16 py-3 flex flex-wrap items-center justify-center gap-3">
        {inReception ? (
          <button
            onClick={onBegin}
            disabled={busy}
            data-testid="instructor-begin-btn"
            className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-clay text-white font-medium hover:bg-clay/90 transition-colors disabled:opacity-50"
          >
            <Play className="w-4 h-4" /> {t('live.instructor.control.begin')}
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <button
                onClick={onPrev}
                disabled={!canPrev || busy}
                data-testid="instructor-prev"
                aria-label={t('live.instructor.control.prev')}
                className="inline-flex items-center gap-1.5 h-11 px-3 sm:px-4 rounded-full border border-border bg-background text-sm font-medium text-foreground hover:border-clay/50 transition-colors disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">{t('live.instructor.control.prev')}</span>
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
                className={`inline-flex items-center gap-1.5 h-11 px-3 sm:px-5 rounded-full bg-clay text-white text-sm font-medium hover:bg-clay/90 transition-colors disabled:opacity-40 ${
                  allAnswered && canNext ? 'ring-2 ring-menta ring-offset-2 ring-offset-card animate-pulse' : ''
                }`}
              >
                <span className="hidden sm:inline">{t('live.instructor.control.next')}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="h-6 w-px bg-border mx-1 hidden sm:block" aria-hidden="true" />

            <LiveTimerControls running={timerRunning} onStart={onStartTimer} onStop={onStopTimer} />
          </>
        )}
      </div>
    </div>
  );
}
