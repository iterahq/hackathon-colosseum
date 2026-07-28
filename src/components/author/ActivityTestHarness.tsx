/**
 * Per-kind "run as student" TEST harness (plan 20260706, Phase 5 / ADR-12).
 *
 * Mounts the SAME `ActivityRenderer` a student sees, wired to a REAL
 * `onComplete` — but the completion is written to an IN-MEMORY result sink
 * (React local state) ONLY. It NEVER calls `persistActivityProgress` (or any
 * itera.progress / activity_results / xp_events write). This module deliberately
 * imports NOTHING from `@/services/progress.service` NOR from
 * `@/services/artifact.service` — that is the guarantee of ZERO DB writes and
 * ZERO storage writes. The author attempts the activity, sees the
 * correct/incorrect verdict, and can reset to try again; nothing persists.
 *
 * ⚠️ Activities hand produced content UP via `onComplete(correct, detail)`. The
 * harness receives that `detail` and DROPS it into local state. Only the
 * learner-facing player persists it. If you ever move a save INTO an activity
 * component, you silently break this guarantee — keep writes at the player.
 */
import { useCallback, useState } from 'react';
import { CheckCircle2, RotateCcw, XCircle, FlaskConical } from 'lucide-react';
import { Badge, Button } from '@devfellowship/components';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { FeedbackFooter } from '@/components/branded/activity/FeedbackFooter';
import type { ActivityCompleteDetail } from '@/components/branded/activity/activityFeedbackKinds';
import type { Activity } from '@/types/content';

/** A single in-memory attempt result — never persisted. */
export interface TestAttempt {
  correct: boolean;
  at: number;
  detail?: ActivityCompleteDetail;
}

export function ActivityTestHarness({ activity }: { activity: Activity }) {
  // In-memory result sink. `attempt` holds the latest verdict; `runKey` forces a
  // fresh ActivityRenderer mount on reset so internal activity state clears.
  const [attempt, setAttempt] = useState<TestAttempt | null>(null);
  const [runKey, setRunKey] = useState(0);
  // The learner-facing fixed footer is dismissed on "Continuar" (there's no next
  // activity in the single-activity harness) while the author-debug verdict row
  // below stays. Reset restores it.
  const [footerDismissed, setFooterDismissed] = useState(false);

  // The REAL onComplete — updates LOCAL state only. No network, no DB.
  const handleComplete = useCallback((correct: boolean, detail?: ActivityCompleteDetail) => {
    setAttempt({ correct, at: Date.now(), detail });
  }, []);

  const reset = useCallback(() => {
    setAttempt(null);
    setFooterDismissed(false);
    setRunKey((k) => k + 1);
  }, []);

  // The sandbox surfaces its terminal verdict + "Continuar" in the shared fixed
  // FeedbackFooter (same as the async player) — mirror that here so the author
  // "run as student" preview matches production. Scoped to the sandbox so other
  // kinds keep the harness's plain in-memory verdict row.
  const showSandboxFooter =
    activity.kind === 'sandbox_scenario' && !!attempt && !footerDismissed;

  return (
    <div className="flex flex-col gap-4" data-testid="activity-test-harness">
      {/* Sandbox banner — makes it unmistakable nothing is being recorded. */}
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
        <FlaskConical className="h-3.5 w-3.5" />
        Test mode — sandboxed, nothing is saved
      </div>

      {/* The real renderer, remounted on reset via `key`. */}
      <div key={runKey}>
        <ActivityRenderer activity={activity} onComplete={handleComplete} />
      </div>

      {showSandboxFooter && attempt && (
        <FeedbackFooter
          result={{ correct: attempt.correct, message: attempt.detail?.message, explanation: attempt.detail?.explanation }}
          onContinue={() => setFooterDismissed(true)}
          continueTestId="sandbox-continue"
        />
      )}

      {/* Verdict + reset — driven purely by the in-memory sink. */}
      {attempt && (
        <div
          data-testid="test-verdict"
          data-correct={attempt.correct ? 'true' : 'false'}
          className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
        >
          <div className="flex items-center gap-2">
            {attempt.correct ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive" />
            )}
            <span className="text-sm font-semibold text-foreground">
              {attempt.correct ? 'Correct' : 'Incorrect'}
            </span>
            <Badge variant="secondary">not saved</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={reset} data-testid="test-reset">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      )}
    </div>
  );
}

export default ActivityTestHarness;
