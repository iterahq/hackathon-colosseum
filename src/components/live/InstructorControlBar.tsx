import { Play, Square, ChevronLeft, ChevronRight, Link2, Check } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveTimerControls } from '@/components/live/LiveTimerControls';

interface InstructorControlBarProps {
  /** Reception (pointer not set yet) — only "Begin" + share + end are shown. */
  inReception: boolean;
  activityIndex: number;
  activityCount: number;
  busy: boolean;
  canPrev: boolean;
  canNext: boolean;
  timerRunning: boolean;
  copied: boolean;
  onBegin: () => void;
  onPrev: () => void;
  onNext: () => void;
  onStartTimer: (seconds: number) => void;
  onStopTimer: () => void;
  onCopyLink: () => void;
  onEnd: () => void;
}

/**
 * The instructor's fixed presenter toolbar — the ONLY thing that separates the
 * professor's screen from a learner's (per Tainan: same stage, controls around
 * it). Pinned to the bottom so it never alters the shared chrome/stage above;
 * on screen-share the learners see the same activity, just without this bar.
 */
export function InstructorControlBar({
  inReception,
  activityIndex,
  activityCount,
  busy,
  canPrev,
  canNext,
  timerRunning,
  copied,
  onBegin,
  onPrev,
  onNext,
  onStartTimer,
  onStopTimer,
  onCopyLink,
  onEnd,
}: InstructorControlBarProps) {
  const { t } = useI18n();

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      data-testid="instructor-control-bar"
    >
      <div className="mx-auto max-w-5xl px-4 md:px-6 min-h-16 py-3 flex flex-wrap items-center gap-3">
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
                className="inline-flex items-center gap-1.5 h-11 px-4 rounded-full border border-border bg-background text-sm font-medium text-foreground hover:border-clay/50 transition-colors disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" /> {t('live.instructor.control.prev')}
              </button>
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono tabular-nums">
                {activityIndex + 1}/{activityCount}
              </span>
              <button
                onClick={onNext}
                disabled={!canNext || busy}
                data-testid="instructor-next"
                aria-label={t('live.instructor.control.next')}
                className="inline-flex items-center gap-1.5 h-11 px-5 rounded-full bg-clay text-white text-sm font-medium hover:bg-clay/90 transition-colors disabled:opacity-40"
              >
                {t('live.instructor.control.next')} <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="h-6 w-px bg-border mx-1 hidden sm:block" aria-hidden="true" />

            <LiveTimerControls running={timerRunning} onStart={onStartTimer} onStop={onStopTimer} />
          </>
        )}

        <div className="flex items-center gap-2.5 ml-auto">
          <button
            onClick={onCopyLink}
            data-testid="instructor-copy-link"
            className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-full border border-border bg-background text-sm font-medium text-foreground hover:border-menta/50 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-menta" /> {t('live.instructor.copyLinkDone')}
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4" /> {t('live.instructor.copyLink')}
              </>
            )}
          </button>
          <button
            onClick={onEnd}
            disabled={busy}
            data-testid="instructor-end"
            className="inline-flex items-center gap-1.5 h-11 px-4 rounded-full border border-destructive/40 bg-destructive/10 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
          >
            <Square className="w-3.5 h-3.5" /> {t('live.instructor.control.end')}
          </button>
        </div>
      </div>
    </div>
  );
}
