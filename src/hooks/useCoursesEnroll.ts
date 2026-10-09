/**
 * Enrolls the learner in a catalog course and opens it. One state per course, so two cards can enroll
 * at once and each shows its own pending label and error.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEnroll } from '@/hooks/useCatalog';
import type { Course } from '@/utils/courses';

export type EnrollStates = Record<string, { pending: boolean; failed: boolean }>;

export function useCoursesEnroll() {
  const navigate = useNavigate();
  const enroll = useEnroll();
  const [states, setStates] = useState<EnrollStates>({});

  const enrollIn = async (course: Course) => {
    if (states[course.id]?.pending) return;
    const settle = (failed: boolean) => setStates((all) => ({ ...all, [course.id]: { pending: false, failed } }));
    setStates((all) => ({ ...all, [course.id]: { pending: true, failed: false } }));
    try {
      await enroll.mutateAsync(course.id);
      settle(false);
      navigate(`/program/${course.slug}`);
    } catch {
      settle(true);
    }
  };

  return { states, enrollIn };
}
