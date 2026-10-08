import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { TACTILE_CTA, TACTILE_SECONDARY, TeraAvatar } from '@iterahq/activities';
import { useI18n } from '@/i18n';

/**
 * End-of-lesson screen. When a next lesson exists the CTA routes straight into
 * it; otherwise the course is over and it goes back to the dashboard. The old
 * CTA always sent the learner to "Descobrir", which read as confusing on a
 * "5/5 lições concluídas" screen.
 */
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
      className="rounded-3xl border border-border bg-card p-10 text-center"
      data-testid="lesson-complete"
    >
      <div className="mx-auto flex w-24 justify-center pt-6" data-testid="lesson-complete-tera">
        <TeraAvatar mood="happy" size="xl" />
      </div>
      <h2 className="font-display text-3xl text-foreground mt-5">{t('lesson.complete')}</h2>
      <p className="text-sm text-muted-foreground mt-2">
        {doneCount}/{total} {t('label.activities').toLowerCase()}
      </p>
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
    </motion.div>
  );
}
