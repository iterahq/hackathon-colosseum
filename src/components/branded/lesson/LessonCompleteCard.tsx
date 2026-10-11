import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { TACTILE_CTA, TACTILE_SECONDARY } from '@iterahq/activities';
import { CrystalGlyph } from '@/components/crystals/CrystalGlyph';
import { useLessonCompanion } from '@/components/lives/lessonCompanion';
import { LearnerMascot } from '@/components/avatar/LearnerMascot';
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

interface CardProps {
  doneCount: number;
  total: number;
  nextLessonId?: string;
  /** Reopens the lesson from activity 1. Absent when there is nothing to revisit. */
  onReview?: () => void;
  /** Activities still missing for the day's stamp. Above zero the card says so instead of celebrating. */
  missing?: number;
  /** Opens the first unfinished activity. */
  onRedoMissing?: () => void;
  /** One extra line under the count (the stamp that will land later). */
  note?: string;
  /** On a phone the card fills the screen when it stands alone; false when something follows it below. */
  fill?: boolean;
}

export function LessonCompleteCard({ doneCount, total, nextLessonId, onReview, missing = 0, onRedoMissing, note, fill = true }: CardProps) {
  const { t } = useI18n();
  const { outfit } = useLessonCompanion();
  const incomplete = missing > 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`rounded-3xl border border-border bg-card p-10 text-center ${fill ? PHONE_FILL : 'max-sm:p-6'}`}
      data-testid="lesson-complete"
      data-state={incomplete ? 'incomplete' : 'complete'}
    >
      <div className="mx-auto flex w-24 justify-center pt-6" data-testid="lesson-complete-tera">
        <LearnerMascot mood={incomplete ? 'neutral' : 'happy'} outfit={outfit} />
      </div>
      <h2 className="font-display text-3xl text-foreground mt-5" data-testid="lesson-complete-title">
        {incomplete ? (missing === 1 ? t('lessonEnd.missing.one') : t('lessonEnd.missing.many', { n: missing })) : t('lesson.complete')}
      </h2>
      <p className="text-sm text-muted-foreground mt-2" data-testid="lesson-complete-count">
        {incomplete ? t('lessonEnd.missing.body', { done: doneCount, total }) : `${doneCount}/${total} ${t('label.activities').toLowerCase()}`}
      </p>
      {note && !incomplete && (
        <p className="text-sm text-muted-foreground mt-2" data-testid="lesson-complete-note">
          {note}
        </p>
      )}
      {incomplete ? (
        <LessonIncompleteActions nextLessonId={nextLessonId} onRedoMissing={onRedoMissing} />
      ) : (
        <LessonCompleteActions nextLessonId={nextLessonId} onReview={onReview} />
      )}
    </motion.div>
  );
}

/** The unfinished day: back to what is missing first, and the usual way onward as "later". */
function LessonIncompleteActions({ nextLessonId, onRedoMissing }: { nextLessonId?: string; onRedoMissing?: () => void }) {
  const { t } = useI18n();
  return (
    <>
      {onRedoMissing && (
        <button
          type="button"
          onClick={onRedoMissing}
          className={`mt-6 flex w-full h-12 px-6 rounded-full items-center justify-center ${TACTILE_CTA}`}
          data-testid="lesson-redo-missing-cta"
        >
          {t('lessonEnd.redo')}
        </button>
      )}
      <Link
        to={nextLessonId ? `/lesson/${nextLessonId}` : '/'}
        className={`mt-3 flex w-full h-12 px-6 rounded-full items-center justify-center ${TACTILE_SECONDARY}`}
        data-testid="lesson-later-cta"
      >
        {t('lessonEnd.later')}
      </Link>
    </>
  );
}

/**
 * The next/finish and review buttons of the end-of-lesson screen; the stamp ceremony reuses them.
 * `gold`: the trail just ended, so the certifications come first and next/finish steps down to secondary.
 */
export function LessonCompleteActions({ nextLessonId, onReview, gold = false }: { nextLessonId?: string; onReview?: () => void; gold?: boolean }) {
  const { t } = useI18n();
  const { bonus, crystals = 0 } = useLessonCompanion();
  const onward = `flex w-full h-12 px-6 rounded-full items-center justify-center ${gold ? `mt-3 ${TACTILE_SECONDARY}` : `mt-6 ${TACTILE_CTA}`}`;
  return (
    <>
      {bonus > 0 && (
        <p className="mt-4 flex items-center justify-center gap-1.5 font-mono text-sm font-semibold text-foreground" data-testid="lesson-lives-bonus">
          <Heart aria-hidden className="h-4 w-4 fill-clay text-clay" />
          {t('lives.bonus', { n: bonus })}
        </p>
      )}
      {crystals > 0 && (
        <p className="mt-3 flex items-center justify-center gap-1.5 font-mono text-sm font-semibold text-foreground" data-testid="lesson-crystals-earned">
          <CrystalGlyph size={16} className="text-evergreen-hi" />
          {crystals === 1 ? t('crystals.earned.one') : t('crystals.earned', { n: crystals })}
        </p>
      )}
      {gold && (
        <Link to="/passport" className={`mt-6 flex w-full h-12 px-6 rounded-full items-center justify-center ${TACTILE_CTA}`} data-testid="lesson-certifications-cta">
          {t('lessonEnd.seeCertifications')}
        </Link>
      )}
      {nextLessonId ? (
        <Link to={`/lesson/${nextLessonId}`} className={onward} data-testid="lesson-next-cta">
          {t('lesson.nextLesson')}
        </Link>
      ) : (
        <Link to="/" className={onward} data-testid="lesson-finish-cta">
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
