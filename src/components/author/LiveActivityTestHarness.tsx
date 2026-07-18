/**
 * LIVE "run as student" TEST harness — the BYOC opt-in sibling of
 * `ActivityTestHarness`. ADDITIVE: it is a NEW file (Samuel's / the existing
 * harness is untouched) that mounts `LiveActivityRenderer` with `forceLive`, so a
 * `sandbox_scenario` runs the REAL responder+judge path instead of the canned
 * deterministic reducer.
 *
 * Same zero-persistence guarantee as the base harness on the PLAYER side: the
 * completion is written to an IN-MEMORY sink only; this module imports NOTHING
 * from `@/services/progress.service`. (Note: the live path DOES call the itera-api
 * `/v1/embed/judge`, which — like the existing AI-judge document activity —
 * persists its OWN verdict server-side; that is pre-existing endpoint behavior,
 * independent of the harness's player-side in-memory sink.)
 */
import { useCallback, useState } from 'react';
import { CheckCircle2, FlaskConical, RotateCcw, XCircle } from 'lucide-react';
import { Badge, Button } from '@devfellowship/components';
import { LiveActivityRenderer } from '@/components/branded/activity/LiveActivityRenderer';
import { FeedbackFooter } from '@/components/branded/activity/FeedbackFooter';
import type { ActivityCompleteDetail } from '@/components/branded/activity/activityFeedbackKinds';
import type { Activity } from '@/types/content';

/** A single in-memory attempt result — never persisted (player side). */
export interface TestAttempt {
  correct: boolean;
  at: number;
  detail?: ActivityCompleteDetail;
}

export function LiveActivityTestHarness({ activity }: { activity: Activity }) {
  const [attempt, setAttempt] = useState<TestAttempt | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [footerDismissed, setFooterDismissed] = useState(false);

  const handleComplete = useCallback((correct: boolean, detail?: ActivityCompleteDetail) => {
    setAttempt({ correct, at: Date.now(), detail });
  }, []);

  const reset = useCallback(() => {
    setAttempt(null);
    setFooterDismissed(false);
    setRunKey((k) => k + 1);
  }, []);

  // The BYOC sandbox surfaces its terminal verdict + "Continuar" in the shared
  // fixed FeedbackFooter (same as the live class) — carry the `byoc-continue`
  // testid so the e2e continue-locator resolves to the footer CTA.
  const showSandboxFooter =
    activity.kind === 'sandbox_scenario' && !!attempt && !footerDismissed;

  return (
    <div className="flex flex-col gap-4" data-testid="live-activity-test-harness">
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
        <FlaskConical className="h-3.5 w-3.5" />
        Live test mode — real AI responder + judge, player-side nothing saved
      </div>

      <div key={runKey}>
        <LiveActivityRenderer activity={activity} onComplete={handleComplete} forceLive />
      </div>

      {showSandboxFooter && attempt && (
        <FeedbackFooter
          result={{ correct: attempt.correct, message: attempt.detail?.message, explanation: attempt.detail?.explanation }}
          onContinue={() => setFooterDismissed(true)}
          continueTestId="byoc-continue"
        />
      )}

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

export default LiveActivityTestHarness;
