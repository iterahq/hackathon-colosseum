import type { ReactNode } from 'react';
import { useI18n } from '@/i18n';
import type { ReviewReason } from '@/types/achievements';

interface Props {
  title: string;
  body: string;
  /** The line about what happens next; the reason-specific estimate, when the server gave one. */
  next?: string | null;
  action?: ReactNode;
  id?: string;
  testId?: string;
}

/** The amber card that says a finished day is not stamped on chain, and why. Never claims a stamp. */
export function HeldStampNotice({ title, body, next, action, id, testId = 'held-stamp' }: Props) {
  return (
    <section
      id={id}
      role="status"
      className="flex flex-col gap-2 rounded-[14px] border border-[#F2C66D]/60 bg-[#1A1710] p-4 text-left sm:p-5"
      data-testid={testId}
    >
      <h3 className="[font:700_22px/1.1_'Barlow_Condensed'] text-[#F2C66D]">{title}</h3>
      <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{body}</p>
      {next && <p className="[font:400_13px/1.5_Inter] text-[#A0978A]">{next}</p>}
      {action}
    </section>
  );
}

interface LessonProps {
  reason: ReviewReason;
  minSeconds: number | null;
  clearsBy: string | null;
  /** Reopens the lesson from activity 1: the way to pass one exercise again. */
  onReview?: () => void;
}

/** The end of a lesson whose day the server holds: the reason, what releases it, and the button that does it. */
export function LessonHeldNotice({ reason, minSeconds, clearsBy, onReview }: LessonProps) {
  const { t } = useI18n();
  const redo = clearsBy === 'redo_one_activity';
  const next = redo ? t('lessonEnd.held.redo', { min: minSeconds ?? 20 }) : t('lessonEnd.held.next');
  return (
    <HeldStampNotice
      title={t('lessonEnd.held.title')}
      body={t(`lessonEnd.held.${reason}`)}
      next={next}
      action={
        redo && onReview ? (
          <button type="button" onClick={onReview} className="inline-flex h-11 items-center justify-center self-start rounded-full border border-[#F2C66D] px-5 [font:700_14px_JetBrains_Mono] text-[#F2C66D] hover:bg-[#F2C66D]/10" data-testid="lesson-held-redo">
            {t('lessonEnd.held.redoCta')}
          </button>
        ) : undefined
      }
      testId="lesson-held-stamp"
    />
  );
}
