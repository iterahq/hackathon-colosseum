/**
 * /try — the first lesson with no account and no wallet. The same activity engine and footer as the
 * player, the real content (migration 0251 opens Day 1 to `anon`) and the real server grader asked without
 * a token; nothing is written on the server. Settled answers live in this browser; a sign-in brought back
 * here replays the passes through the normal recorded path and opens the lesson, where the stamp is earned.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HostExplainsMisses, HostHidesAnswerOnMiss, HostNotesMisses, HostOwnsSettledAction, HostRecordsVerdict, HostUnlimitedAttempts } from '@iterahq/activities';
import { useAuth } from '@/auth/AuthContext';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { FeedbackFooter } from '@/components/branded/activity/FeedbackFooter';
import { LessonChrome } from '@/components/branded/lesson/LessonChrome';
import { LessonStepActions } from '@/components/branded/lesson/LessonStepActions';
import { LessonTitle } from '@/components/branded/lesson/LessonTitle';
import { TeraLoader } from '@/components/tera/TeraLoader';
import { TERA_BUTTON, TeraNote } from '@/components/tera/TeraNote';
import { TryClaimScreen } from '@/components/try/TryClaimScreen';
import { TryDoneCard } from '@/components/try/TryDoneCard';
import { GUEST_LESSON_ID } from '@/consts/guestLesson';
import { useLessonContent } from '@/hooks';
import { useGuestLesson } from '@/hooks/useGuestLesson';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useI18n } from '@/i18n';
import { claimGuestAnswers } from '@/services/guestClaim.service';
import { isGuestAccessToken } from '@/services/guestSession.service';
import { isSceneKind } from '@/utils/activityFamilies';
import { isExerciseActivity } from '@/utils/isExerciseActivity';

export default function TryLessonPage() {
  const { t, tText } = useI18n();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const signedIn = Boolean(session) && !isGuestAccessToken(session?.access_token ?? '');
  const { data, isPending, isError, refetch } = useLessonContent(GUEST_LESSON_ID);
  usePageTitle(t('try.title'));
  const lesson = useGuestLesson(data?.activities ?? []);
  const [claim, setClaim] = useState<'idle' | 'saving' | 'failed'>('idle');

  useEffect(() => {
    if (authLoading || !signedIn) return;
    setClaim('saving');
    void claimGuestAnswers().then(({ attempted, landed }) => {
      if (landed === attempted) navigate(`/lesson/${GUEST_LESSON_ID}`, { replace: true });
      else setClaim('failed');
    });
  }, [authLoading, signedIn, navigate]);

  if (claim !== 'idle') return <TryClaimScreen state={claim} />;

  const { current, finished, pending } = lesson;
  return (
    <div className="group/lesson flex min-h-screen flex-col bg-background text-foreground" data-testid="try-page">
      <LessonChrome progressPct={lesson.progressPct} muted={lesson.muted} onToggleMuted={lesson.toggleMuted} onClose={() => navigate('/')} lives={null} step={lesson.finished ? null : { n: lesson.index + 1, total: lesson.total, day: 1 }} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-32 pt-16 sm:pt-4">
        <p className="rounded-xl border border-evergreen/30 bg-evergreen-soft/20 px-4 py-2 text-xs text-muted-foreground" data-testid="try-intro">
          <span className="mr-2 font-mono uppercase tracking-wider text-evergreen-hi">{t('try.eyebrow')}</span>
          {t('try.intro')}
        </p>
        {isPending && <TeraLoader fullScreen delayed />}
        {isError && (
          <TeraNote
            mood="oops"
            title={t('try.error')}
            action={
              <button type="button" onClick={() => void refetch()} className={TERA_BUTTON}>
                {t('try.retry')}
              </button>
            }
          />
        )}
        {data && finished && <TryDoneCard counts={lesson.counts} total={lesson.total} onRedo={lesson.redoMissed} />}
        {data && current && (
          <>
            <LessonTitle text={tText(data.title)} className="mt-4 truncate pb-1 font-display text-xl font-bold text-foreground md:text-2xl" />
            <div className="mt-3" data-testid="try-activity" data-activity-id={current.id}>
              <HostExplainsMisses>
                <HostOwnsSettledAction>
                  <HostUnlimitedAttempts>
                    <HostNotesMisses note={t('lesson.miss.redoForStamp')}>
                      <HostRecordsVerdict onVerdict={lesson.handleVerdict}>
                        <HostHidesAnswerOnMiss hide={lesson.hidesAnswer}>
                          <ActivityRenderer key={`${current.id}:${lesson.retryCount}`} activity={current} onComplete={lesson.handleComplete} />
                        </HostHidesAnswerOnMiss>
                      </HostRecordsVerdict>
                    </HostNotesMisses>
                  </HostUnlimitedAttempts>
                </HostOwnsSettledAction>
              </HostExplainsMisses>
            </div>
            {!isExerciseActivity(current) && !isSceneKind(current.kind) && <LessonStepActions onContinue={() => lesson.handleComplete(true)} />}
          </>
        )}
      </main>
      {!finished && <FeedbackFooter result={pending} onContinue={lesson.advance} onRetry={pending && !pending.correct ? lesson.retryPending : undefined} missNote={t('lesson.miss.redoForStamp')} />}
    </div>
  );
}
