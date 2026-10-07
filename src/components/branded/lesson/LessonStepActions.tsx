import { useI18n } from '@/i18n';

/**
 * The row under an activity that is read or reviewed: "Continuar", and — for an
 * exercise the learner missed — "Tentar de novo" BESIDE it, never under it. A
 * second row cost 60 px and pushed the retry off a short phone (27 px on
 * `order`, 125 px on `multi_choice` at 390×640).
 */
export function LessonStepActions({
  onContinue,
  onRetry,
  busy = false,
}: {
  onContinue: () => void;
  /** Present only when the activity on screen is a miss the learner can re-open. */
  onRetry?: () => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  return (
    // Sticky: on an activity taller than the phone the row stays within reach
    // instead of waiting below the fold. The paddings and the negative margin
    // cancel out, so a screen that fits keeps its height to the pixel.
    <div className="sticky bottom-0 z-10 mt-1 -mb-3 flex gap-3 bg-background pb-3 pt-3" data-testid="lesson-step-actions">
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          data-testid="lesson-retry-missed"
          className="flex-1 min-w-0 inline-flex items-center justify-center h-12 px-4 rounded-full font-semibold border border-border text-foreground transition-colors hover:bg-card"
        >
          {t('common.retry')}
        </button>
      )}
      <button
        type="button"
        onClick={onContinue}
        disabled={busy}
        data-testid="concept-continue"
        className="flex-1 min-w-0 inline-flex items-center justify-center gap-2 h-12 px-4 rounded-full font-semibold bg-evergreen text-obsidiana shadow-[0_4px_0_#249457] transition-[transform,box-shadow,background-color] duration-100 hover:bg-evergreen-hi active:translate-y-[3px] active:shadow-[0_1px_0_#249457] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {t('activity.continue')}
      </button>
    </div>
  );
}
