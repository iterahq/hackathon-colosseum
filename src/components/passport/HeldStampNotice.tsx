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

/** The end of a lesson whose day the server holds: the reason in the server's own terms. */
export function LessonHeldNotice({ reason, eta }: { reason: ReviewReason; eta: string | null }) {
  const { t, locale } = useI18n();
  const when = eta ? new Date(eta) : null;
  const estimate = when && !Number.isNaN(when.getTime()) ? t('lessonEnd.held.eta', { eta: when.toLocaleString(locale === 'en' ? 'en-US' : 'pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) }) : null;
  return (
    <HeldStampNotice
      title={t('lessonEnd.held.title')}
      body={t(`lessonEnd.held.${reason}`)}
      next={[t('lessonEnd.held.next'), estimate].filter(Boolean).join(' ')}
      testId="lesson-held-stamp"
    />
  );
}
