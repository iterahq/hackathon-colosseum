import { useI18n } from '@/i18n';
import { TACTILE_CTA } from '@iterahq/activities';

/** A completion that did not save: says so, and offers the retry — never a trophy. */
export function LessonSaveError({ onRetry, busy = false }: { onRetry: () => void; busy?: boolean }) {
  const { t } = useI18n();
  return (
    <div
      className="mt-7 rounded-2xl border border-clay/40 bg-clay/10 px-4 py-3 text-sm text-foreground flex items-center justify-between gap-3"
      role="alert"
      data-testid="lesson-save-error"
    >
      <span>{t('lesson.saveError')}</span>
      <button
        onClick={onRetry}
        disabled={busy}
        data-testid="lesson-save-retry"
        className={`shrink-0 h-11 px-4 rounded-full text-sm ${TACTILE_CTA}`}
      >
        {t('lesson.retrySave')}
      </button>
    </div>
  );
}
