import { ArrowLeft, ArrowRight, Heart, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import { useI18n } from '@/i18n';

/** Decorative lives count — inert chrome (no lives backend). */
const DECORATIVE_HEARTS = 5;

/** 36 px visual box, 44 px hit area: the pseudo-element is part of the button for pointer events. */
export const HIT_SLOP = 'relative before:absolute before:-inset-1';

/**
 * Immersive chrome of the lesson: full-width progress bar flush to the top
 * edge, close-X on the left, and on the right the mute toggle plus a decorative
 * hearts indicator. The toggle lives here because the self-paced player has no
 * sound dock — without it the chime would have no off switch.
 */
export function LessonChrome({
  progressPct,
  frontierPct,
  muted,
  onToggleMuted,
  onClose,
  onBack,
  onForward,
  forwardDisabled = false,
  onJumpToCurrent,
}: {
  progressPct: number;
  /** How far the learner has ever got. Drawn lighter, behind the solid fill, only while it is ahead. */
  frontierPct?: number;
  muted: boolean;
  onToggleMuted: () => void;
  onClose: () => void;
  /** Absent on the first activity — the arrow is not rendered at all then. */
  onBack?: () => void;
  /** Rendered whenever provided; `forwardDisabled` shows the limit instead of hiding the arrow. */
  onForward?: () => void;
  forwardDisabled?: boolean;
  /** Pill back to the furthest activity reached. The caller only passes it when the arrow is too slow. */
  onJumpToCurrent?: () => void;
}) {
  const { t } = useI18n();

  return (
    <header className="relative">
      <div
        className="relative h-1 w-full bg-muted"
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('label.activities')}
        data-testid="lesson-progress"
      >
        {frontierPct !== undefined && frontierPct > progressPct && (
          <div
            className="absolute inset-y-0 left-0 bg-evergreen/30 transition-[width] duration-300"
            style={{ width: `${frontierPct}%` }}
            data-testid="lesson-progress-frontier"
          />
        )}
        <div
          className="relative h-full bg-evergreen transition-[width] duration-300"
          style={{ width: `${progressPct}%` }}
          data-testid="lesson-progress-fill"
        />
      </div>

      <div className="absolute top-2.5 max-sm:top-1.5 left-3 md:left-4 h-9 flex items-center gap-2">
        <button
          onClick={onClose}
          aria-label={t('common.back')}
          data-testid="lesson-close"
          className={`${HIT_SLOP} w-9 h-9 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors`}
        >
          <X className="w-4 h-4" />
        </button>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t('lesson.prev')}
            data-testid="lesson-prev"
            className={`${HIT_SLOP} w-9 h-9 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors`}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        {onForward && (
          <button
            type="button"
            onClick={onForward}
            disabled={forwardDisabled}
            aria-label={t('lesson.next')}
            data-testid="lesson-next"
            className={`${HIT_SLOP} w-9 h-9 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-40 disabled:pointer-events-none`}
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
        {onJumpToCurrent && (
          <button
            type="button"
            onClick={onJumpToCurrent}
            aria-label={t('lesson.jumpToCurrent')}
            data-testid="lesson-jump-current"
            className={`${HIT_SLOP} h-9 min-w-9 rounded-full border border-border bg-card px-3 flex items-center justify-center gap-1.5 text-sm font-medium text-evergreen-hi hover:border-evergreen-hi/50 transition-colors`}
          >
            <SkipForward className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">{t('lesson.jumpToCurrent')}</span>
          </button>
        )}
      </div>

      <div className="absolute top-2.5 max-sm:top-1.5 right-3 md:right-4 h-9 flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleMuted}
          aria-pressed={muted}
          aria-label={t('lesson.sound.mute')}
          data-testid="lesson-sound-toggle"
          className={`${HIT_SLOP} w-9 h-9 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors`}
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <div
          className="flex items-center gap-1.5 text-foreground"
          data-testid="lesson-hearts"
          aria-hidden="true"
        >
          <Heart className="w-4 h-4 fill-clay text-clay" />
          <span className="font-mono text-sm tabular-nums">{DECORATIVE_HEARTS}</span>
        </div>
      </div>
    </header>
  );
}
