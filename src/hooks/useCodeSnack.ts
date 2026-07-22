import { useCallback, useEffect, useRef, useState } from 'react';
import type { CodeSpec } from '@iterahq/activity-spec';
import { saveCodeSnapshot } from '@/services/codeSnapshot.service';
import type { UseCodeSnackCallbacks } from '@/types/codeSnack';

const AUTOSAVE_DEBOUNCE_MS = 600;

/**
 * Owns the code-snack's editable source, debounced autosave, and completion
 * wiring. The MVP has no grading — completion is the learner clicking Done. The
 * live preview (react-live inside a sandboxed iframe) is pure view; this hook
 * only feeds it the current `code`.
 */
export function useCodeSnack(
  activityId: string,
  spec: CodeSpec,
  callbacks: UseCodeSnackCallbacks,
) {
  const { onComplete, onAutosave } = callbacks;
  const [code, setCode] = useState(spec.starter ?? '');

  const persist = useCallback(
    (next: string) => {
      if (onAutosave) onAutosave(next);
      else saveCodeSnapshot(activityId, next);
    },
    [activityId, onAutosave],
  );

  // Reset to the seed when the activity changes (golden pattern: reset on [activity.id]).
  useEffect(() => {
    setCode(spec.starter ?? '');
  }, [activityId, spec.starter]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => persist(code), AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [code, persist]);

  const complete = useCallback(() => onComplete(true), [onComplete]);

  return { code, setCode, complete };
}
