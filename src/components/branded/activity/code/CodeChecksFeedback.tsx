import { motion } from 'framer-motion';
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import type { CodeCheck } from '@iterahq/activity-spec';
import { useI18n } from '@/i18n';
import type { CodeCheckResult } from '@/types/codeSnack';

/**
 * The post-submit feedback screen for a graded code snack.
 *
 * Deliberately NOT a live checklist under the preview: while the learner edits,
 * the screen is just editor + preview (Tainan, 2026-07-23 — "não tem essa
 * checklist embaixo não, mais simples… quando ele submete, daí sim ele
 * visualiza"). Showing the verdicts continuously turns the exercise into a
 * hot/cold game and pulls attention away from the code.
 *
 * `hint` is revealed ONLY on the lines that failed — a hint next to something
 * the learner already got right is noise, and the gate for hints is now the
 * submit itself rather than a timer.
 */
export function CodeChecksFeedback({
  checks,
  results,
  allPassed,
  settled = false,
  live = false,
  onRetry,
  onContinue,
}: {
  checks: CodeCheck[];
  results: CodeCheckResult[];
  allPassed: boolean;
  /** The result was already reported upward — the actions are spent. */
  settled?: boolean;
  /**
   * Live class vs. self-paced. "Seguir mesmo assim" (skip a failed practical) is
   * offered ONLY in live, where it reports the learner's attempt so the class
   * moves on; self-paced must fix and retry, so the escape hatch is hidden there.
   */
  live?: boolean;
  /** Back to editing with the learner's code intact. */
  onRetry: () => void;
  /** Settle the activity with the REAL result (passed or not). */
  onContinue: () => void;
}) {
  const { t } = useI18n();
  const passedCount = results.filter((r) => r.passed).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mt-4 rounded-2xl border p-4 md:p-5 ${
        allPassed ? 'border-menta/40 bg-menta/10' : 'border-clay/40 bg-clay/10'
      }`}
      role="status"
      aria-live="polite"
      data-testid="code-checks-feedback"
      data-all-passed={allPassed ? 'true' : 'false'}
      data-settled={settled ? 'true' : undefined}
    >
      <div className="flex items-center gap-2">
        {allPassed ? (
          <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-menta" />
        ) : (
          <XCircle className="h-5 w-5 flex-shrink-0 text-clay" />
        )}
        <p
          className={`font-display font-semibold ${allPassed ? 'text-menta' : 'text-clay'}`}
          data-testid="code-checks-title"
        >
          {allPassed ? t('code.checks.allPassed') : t('code.checks.someFailed')}
        </p>
        <span className="ml-auto font-mono text-xs text-muted-foreground" data-testid="code-checks-score">
          {t('code.checks.score', { passed: String(passedCount), total: String(results.length) })}
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {results.map((result) => {
          const check = checks.find((c) => c.id === result.id);
          if (!check) return null;
          return (
            <li
              key={result.id}
              className="flex items-start gap-2 text-sm"
              data-testid="code-check-item"
              data-check-id={result.id}
              data-passed={result.passed ? 'true' : 'false'}
            >
              {result.passed ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-menta" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <p className={result.passed ? 'text-foreground' : 'text-muted-foreground'}>
                  {check.label}
                </p>
                {!result.passed && check.hint && (
                  <p className="mt-0.5 text-xs text-clay" data-testid="code-check-hint">
                    {check.hint}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {!allPassed && (
          <button
            type="button"
            onClick={onRetry}
            disabled={settled}
            data-testid="code-checks-retry"
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-evergreen px-6 font-medium text-obsidiana transition-colors hover:bg-evergreen-hi disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="h-4 w-4" />
            {t('code.checks.retry')}
          </button>
        )}
        {/* Success always advances; the failure "seguir mesmo assim" is live-only. */}
        {(allPassed || live) && (
          <button
            type="button"
            onClick={onContinue}
            disabled={settled}
            data-testid="code-checks-continue"
            className={`inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full px-6 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              allPassed
                ? 'bg-menta text-obsidiana hover:bg-evergreen-hi'
                : 'border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {allPassed ? t('activity.continue') : t('code.checks.continueAnyway')}
          </button>
        )}
      </div>
    </motion.div>
  );
}
