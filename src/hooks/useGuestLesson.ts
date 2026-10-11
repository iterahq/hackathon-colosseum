/**
 * The state of the public first lesson for a visitor: which activity is on screen, what was answered (kept
 * in this browser), the footer verdict, and the counts the end card shows. Grading asks the server without
 * a token; the client verdict drives the screen, the server's answer is kept beside it when it comes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isFooterGradedKind, type ActivityCompleteDetail, type FooterResult } from '@/components/branded/activity/activityFeedbackKinds';
import { isByocActivity } from '@/components/branded/activity/byoc/byocSpec';
import { useLessonSound } from '@/hooks/useLessonSound';
import { submitForGrading } from '@/services/grade.service';
import type { Activity } from '@/types/content';
import type { GuestAnswer, GuestAnswers } from '@/types/guestLesson';
import { isSceneKind } from '@/utils/activityFamilies';
import { forgetGuestAnswer, readGuestAnswers, writeGuestAnswer } from '@/utils/guestLessonStorage';
import { isExerciseActivity } from '@/utils/isExerciseActivity';

const holdsOnFooter = (activity: Activity): boolean => isFooterGradedKind(activity.kind) || isByocActivity(activity) || isSceneKind(activity.kind);

export function useGuestLesson(activities: readonly Activity[]) {
  const { muted, toggleMuted, onSettle, onAdvance, onRetry, onFinish } = useLessonSound();
  const [answers, setAnswers] = useState<GuestAnswers>(() => readGuestAnswers());
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState<FooterResult | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const positionedRef = useRef(false);

  useEffect(() => {
    if (positionedRef.current || activities.length === 0) return;
    positionedRef.current = true;
    const first = activities.findIndex((a) => !answers[a.id]);
    if (first === -1) setFinished(true);
    else setIndex(first);
  }, [activities, answers]);

  const total = activities.length;
  const current = finished ? null : (activities[index] ?? null);
  const counts = useMemo(
    () => ({
      passed: activities.filter((a) => answers[a.id]?.correct).length,
      serverChecked: activities.filter((a) => answers[a.id]?.serverVerdict === 'pass').length,
    }),
    [activities, answers]
  );
  const progressPct = total ? Math.round(((finished ? total : index) / total) * 100) : 0;

  const advance = useCallback(() => {
    setPending(null);
    onAdvance();
    if (index >= total - 1) {
      setFinished(true);
      onFinish();
    } else {
      setIndex(index + 1);
    }
  }, [index, total, onAdvance, onFinish]);

  const settle = useCallback((activity: Activity, correct: boolean, detail?: ActivityCompleteDetail) => {
    const entry: GuestAnswer = {
      correct,
      settledAt: Date.now(),
      ...(detail?.response ? { response: detail.response } : {}),
      ...(detail?.actions ? { actions: [...detail.actions] } : {}),
    };
    setAnswers(writeGuestAnswer(activity.id, entry));
    if (!isExerciseActivity(activity)) return;
    void submitForGrading({ activityId: activity.id, passed: correct, response: detail?.response ?? null, actions: detail?.actions }).then((verdict) => {
      if (!verdict) return;
      setAnswers(writeGuestAnswer(activity.id, { ...entry, serverVerdict: verdict.verdict === 'pass' ? 'pass' : 'fail' }));
    });
  }, []);

  const handleComplete = useCallback(
    (correct: boolean, detail?: ActivityCompleteDetail) => {
      if (!current) return;
      settle(current, correct, detail);
      if (!holdsOnFooter(current)) {
        advance();
        return;
      }
      if (!isSceneKind(current.kind)) onSettle(correct);
      setPending({ correct, message: detail?.message, explanation: detail?.explanation });
    },
    [current, settle, advance, onSettle]
  );

  const reopen = useCallback(
    (at: number) => {
      const target = activities[at];
      if (!target) return;
      setAnswers(forgetGuestAnswer(target.id));
      setPending(null);
      setRetryCount((c) => c + 1);
      setFinished(false);
      setIndex(at);
      onRetry();
    },
    [activities, onRetry]
  );

  const retryPending = useCallback(() => reopen(index), [reopen, index]);
  const redoMissed = useCallback(() => reopen(activities.findIndex((a) => !answers[a.id]?.correct)), [reopen, activities, answers]);

  return { muted, toggleMuted, current, index, total, finished, pending, retryCount, counts, progressPct, handleComplete, advance, retryPending, redoMissed };
}
