import { ArrowLeft, Heart, Volume2, VolumeX, X } from 'lucide-react';
import { useI18n } from '@/i18n';

/** Decorative lives count — inert chrome (no lives backend). */
const DECORATIVE_HEARTS = 5;

/**
 * Immersive chrome of the lesson: full-width progress bar flush to the top
 * edge, close-X on the left, and on the right the mute toggle plus a decorative
 * hearts indicator. The toggle lives here because the self-paced player has no
 * sound dock — without it the chime would have no off switch.
 */
export function LessonChrome({
  progressPct,
  muted,
  onToggleMuted,
  onClose,
  onBack,
}: {
  progressPct: number;
  muted: boolean;
  onToggleMuted: () => void;
  onClose: () => void;
  /** Absent on the first activity — the arrow is not rendered at all then. */
  onBack?: () => void;
}) {
  const { t } = useI18n();

  return (
    <header className="relative">
      <div
        className="h-1 w-full bg-muted"
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('label.activities')}
        data-testid="lesson-progress"
      >
        <div
          className="h-full bg-evergreen transition-[width] duration-300"
          style={{ width: `${progressPct}%` }}
          data-testid="lesson-progress-fill"
        />
      </div>

      <div className="absolute top-2.5 left-3 md:left-4 h-9 flex items-center gap-2">
        <button
          onClick={onClose}
          aria-label={t('common.back')}
          data-testid="lesson-close"
          className="w-9 h-9 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t('lesson.prev')}
            data-testid="lesson-prev"
            className="w-9 h-9 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="absolute top-2.5 right-3 md:right-4 h-9 flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleMuted}
          aria-pressed={muted}
          aria-label={t('lesson.sound.mute')}
          data-testid="lesson-sound-toggle"
          className="w-9 h-9 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
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
