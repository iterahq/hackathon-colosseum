import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { TACTILE_CTA, TACTILE_SECONDARY, TeraAvatar } from '@iterahq/activities';
import { useI18n } from '@/i18n';

/**
 * End-of-lesson screen. When a next lesson exists the CTA routes straight into
 * it; otherwise the course is over and it goes back to the dashboard. The old
 * CTA always sent the learner to "Descobrir", which read as confusing on a
 * "5/5 lições concluídas" screen.
 *
 * On a phone the card fills the height the player leaves free (viewport minus
 * the 52 px chrome strip above and the bottom reserve below) and centres its
 * content, so the thumb finds the buttons mid-screen instead of a small card
 * parked at the top of an empty page. From `sm` up it keeps its natural size.
 */
export const PHONE_FILL =
  'max-sm:min-h-[calc(100svh-3.25rem-1rem-env(safe-area-inset-bottom,0px))] max-sm:flex max-sm:flex-col max-sm:justify-center max-sm:p-6';

export function LessonCompleteCard({
  doneCount,
  total,
  nextLessonId,
  onReview,
}: {
  doneCount: number;
  total: number;
  nextLessonId?: string;
  /** Reopens the lesson from activity 1. Absent when there is nothing to revisit. */
  onReview?: () => void;
}) {
  const { t } = useI18n();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`rounded-3xl border border-border bg-card p-10 text-center ${PHONE_FILL}`}
      data-testid="lesson-complete"
    >
      <div className="mx-auto flex w-24 justify-center pt-6" data-testid="lesson-complete-tera">
        <TeraAvatar mood="happy" size="xl" />
      </div>
      <h2 className="font-display text-3xl text-foreground mt-5">{t('lesson.complete')}</h2>
      <p className="text-sm text-muted-foreground mt-2">
        {doneCount}/{total} {t('label.activities').toLowerCase()}
      </p>
      <LessonCompleteActions nextLessonId={nextLessonId} onReview={onReview} />
    </motion.div>
  );
}

/** The next/finish and review buttons of the end-of-lesson screen; the stamp ceremony reuses them. */
export function LessonCompleteActions({ nextLessonId, onReview }: { nextLessonId?: string; onReview?: () => void }) {
  const { t } = useI18n();
  return (
    <>
      {nextLessonId ? (
        <Link
          to={`/lesson/${nextLessonId}`}
          className={`mt-6 flex w-full h-12 px-6 rounded-full items-center justify-center ${TACTILE_CTA}`}
          data-testid="lesson-next-cta"
        >
          {t('lesson.nextLesson')}
        </Link>
      ) : (
        <Link
          to="/"
          className={`mt-6 flex w-full h-12 px-6 rounded-full items-center justify-center ${TACTILE_CTA}`}
          data-testid="lesson-finish-cta"
        >
          {t('lesson.finishCourse')}
        </Link>
      )}
      {onReview && (
        <button
          type="button"
          onClick={onReview}
          className={`mt-3 flex w-full h-12 px-6 rounded-full items-center justify-center ${TACTILE_SECONDARY}`}
          data-testid="lesson-review-cta"
        >
          {t('lesson.review')}
      </button>
    )}
    </>
  );
}
