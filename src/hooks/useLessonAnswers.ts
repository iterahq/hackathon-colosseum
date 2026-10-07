/**
 * What the learner answered in the lesson on screen, hit or miss: the React
 * state and its localStorage copy (`lessonAnswerStorage`), always written
 * together. Keeping the pair in one place is the point — an answer in state but
 * not in storage re-opens blank after a reload, and the reverse locks an
 * exercise the screen shows as open.
 */
import { useCallback, useState } from 'react';
import { clearCodeAttempts } from '@/services/codeAttempts.service';
import {
  clearLessonAnswers,
  storeLessonAnswer,
  type StoredLessonAnswer,
} from '@/utils/lessonAnswerStorage';

export interface LessonAnswers {
  answers: Readonly<Record<string, StoredLessonAnswer>>;
  /** Bumped by every retry: part of the activity's key, so it re-mounts fresh. */
  retryCount: number;
  /** Replace everything — a lesson was resumed, or another one opened. */
  load: (answers: Record<string, StoredLessonAnswer>) => void;
  /** Keep one settled answer, on screen and on disk. */
  record: (activityId: string, answer: StoredLessonAnswer) => void;
  /**
   * Forget a miss so the exercise opens again. A `code` exercise missed by
   * running out of lives gets them back; its draft stays.
   */
  retry: (activityId: string) => void;
}

export function useLessonAnswers(): LessonAnswers {
  const [answers, setAnswers] = useState<Record<string, StoredLessonAnswer>>({});
  const [retryCount, setRetryCount] = useState(0);

  const load = useCallback((next: Record<string, StoredLessonAnswer>) => {
    setAnswers(next);
    setRetryCount(0);
  }, []);

  const record = useCallback((activityId: string, answer: StoredLessonAnswer) => {
    storeLessonAnswer(activityId, answer);
    setAnswers((prev) => ({ ...prev, [activityId]: answer }));
  }, []);

  const retry = useCallback((activityId: string) => {
    clearLessonAnswers([activityId]);
    clearCodeAttempts(activityId);
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[activityId];
      return next;
    });
    setRetryCount((n) => n + 1);
  }, []);

  return { answers, retryCount, load, record, retry };
}
