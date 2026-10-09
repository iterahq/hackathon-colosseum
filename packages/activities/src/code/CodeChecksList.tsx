import { useState } from 'react';
import { CheckCircle2, ChevronDown, XCircle } from 'lucide-react';
import type { CodeCheck } from '@iterahq/activity-spec';
import { useActivityI18n } from '../context.js';
import type { CodeCheckResult } from './types.js';

/**
 * The per-check verdict list inside the feedback screen.
 *
 * `hint` is revealed ONLY on the lines that failed — a hint next to something
 * the learner already got right is noise, and the gate for hints is the submit
 * itself rather than a timer.
 *
 * On a phone, once something failed, the checks that passed fold into a toggle:
 * they are already counted in the score, and the failed lines are what the
 * learner has to read. From `sm` up the whole list stays visible, and the folded
 * rows stay in the DOM either way — nothing is removed, only hidden.
 */
export function CodeChecksList({
  checks,
  results,
}: {
  checks: CodeCheck[];
  results: CodeCheckResult[];
}) {
  const { t } = useActivityI18n();
  const [expanded, setExpanded] = useState(false);
  const passedCount = results.filter((r) => r.passed).length;
  const foldPassed = passedCount > 0 && passedCount < results.length && !expanded;
  const canToggle = passedCount > 0 && passedCount < results.length;

  return (
    <>
    <ul className="mt-2 space-y-1.5 sm:mt-3 sm:space-y-2">
      {results.map((result) => {
        const check = checks.find((c) => c.id === result.id);
        if (!check) return null;
        return (
          <li
            key={result.id}
            className={`items-start gap-2 text-sm ${
              result.passed && foldPassed ? 'hidden sm:flex' : 'flex'
            }`}
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
    {canToggle && (
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        data-testid="code-checks-passed-toggle"
        className="mt-1.5 inline-flex min-h-8 items-center gap-1 text-xs text-muted-foreground sm:hidden"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        {expanded
          ? t('code.checks.hidePassed')
          : t('code.checks.showPassed', { count: String(passedCount) })}
      </button>
    )}
    </>
  );
}
