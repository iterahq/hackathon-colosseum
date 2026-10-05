import type { ReactNode, MouseEvent } from 'react';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import type { ActivityCompleteDetail } from '@/components/branded/activity/activityFeedbackKinds';
import type { Activity } from '@/types/content';

interface LiveActivityStageProps {
  activity: Activity;
  /**
   * Read-only mirror: the activity renders EXACTLY as the learner sees it, just
   * `inert` (no pointer/keyboard, hidden from a11y) and unselectable — no frame,
   * no "preview" box. Used by the instructor surface and by the learner once the
   * timer locks the activity.
   */
  readOnly?: boolean;
  /** Reveal the correct answer (timer stopped/expired) even without a submission. */
  reveal?: boolean;
  /**
   * Widened to forward the activity's `detail` (PR #193's channel) so the live
   * page can record WHAT the learner answered, not just whether it was right.
   * Additive: a narrower `(correct) => void` handler stays assignable.
   */
  onComplete?: (correct: boolean, detail?: ActivityCompleteDetail) => void;
  /**
   * Fired when the learner clicks an activity's "Enviar" (the `*-submit` button)
   * — the intermediate step before the correct/wrong confirm. Caught by
   * delegation so we don't thread a prop through every activity kind.
   */
  onSubmit?: () => void;
  /** The centered timer/stopwatch row above the activity (page composes it). */
  timerSlot?: ReactNode;
  /** Hints/notes below the activity (answered/locked on the learner side). */
  footer?: ReactNode;
  /** Overrides the inner wrapper testid (kept for the instructor mirror). */
  testid?: string;
  /**
   * Bumped when the learner reopens their submission (ADR-1), to force the same
   * activity to remount. A liquidated activity sits in its own terminal phase
   * (`useCodeChecks` `settled`) and nothing outside it can walk that back — the
   * remount is what puts it back in `editing`. `code` re-seeds the editor from its
   * own autosaved snapshot, so the work survives whenever that snapshot does
   * (`useCodeSnack` debounces the autosave, so the last keystrokes may not).
   */
  attempt?: number;
}

const noop = () => {};

/**
 * The activity "stage" shared by the learner and instructor surfaces so both see
 * the same thing — same renderer, same timer placement, same width. The only
 * difference is `readOnly` (the professor + a locked learner don't interact).
 */
export function LiveActivityStage({
  activity,
  readOnly = false,
  reveal = false,
  onComplete,
  onSubmit,
  timerSlot,
  footer,
  testid,
  attempt = 0,
}: LiveActivityStageProps) {
  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (readOnly || !onSubmit) return;
    if ((e.target as HTMLElement).closest('[data-testid$="-submit"]')) onSubmit();
  };

  return (
    <div className="mt-7">
      {timerSlot && <div className="mb-5 flex items-center justify-center gap-3">{timerSlot}</div>}
      {/* key on the activity id so a force-advance fully remounts the renderer
          (fresh state). `inert` blocks interaction + hides the inner controls
          from the a11y tree when read-only. */}
      <div
        className={readOnly ? 'select-none' : undefined}
        data-testid={testid}
        onClick={handleClick}
        {...(readOnly ? { inert: true } : {})}
      >
        <ActivityRenderer key={`${activity.id}:${attempt}`} activity={activity} onComplete={onComplete ?? noop} reveal={reveal} live />
      </div>
      {footer}
    </div>
  );
}
