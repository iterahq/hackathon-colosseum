/**
 * BYOC ("Bring Your Own Context") — two steps in one activity: the learner types
 * their own context, and the activity is generated on top of it.
 *
 * The model runs ONCE, at generation. Answering is a local lookup against the
 * gabarito that generation embedded (ADR-13) — no judge, no model call, so the
 * activity behaves like any other graded kind once the tree is on screen.
 *
 * This file is only the wiring (auth token + generation state); every phase the
 * learner sees lives in `ByocActivityView`.
 */
import type { ByocSpec } from '@iterahq/activity-spec';
import { useAuth } from '@/auth/AuthContext';
import type { Activity } from '@/types/content';
import { ByocActivityView } from './ByocActivityView';
import { useByoc } from './useByoc';

export function ByocActivity({
  activity,
  spec,
  onComplete,
  reveal = false,
}: {
  activity: Activity;
  spec: ByocSpec;
  onComplete: (correct: boolean) => void;
  reveal?: boolean;
}) {
  const { session, loading } = useAuth();
  const state = useByoc({
    activityId: activity.id,
    token: session?.access_token ?? '',
    ready: !loading,
    fallback: spec.fallback,
  });

  return (
    <ByocActivityView
      activity={activity}
      spec={spec}
      onComplete={onComplete}
      reveal={reveal}
      state={state}
    />
  );
}
