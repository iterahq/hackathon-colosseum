import { useI18n } from '@/i18n';

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
        className="shrink-0 h-9 px-4 rounded-full bg-evergreen text-obsidiana text-sm font-medium hover:bg-evergreen-hi transition-colors disabled:opacity-60"
      >
        {t('lesson.retrySave')}
      </button>
    </div>
  );
}
