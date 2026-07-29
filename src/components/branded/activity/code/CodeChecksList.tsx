import { CheckCircle2, XCircle } from 'lucide-react';
import type { CodeCheck } from '@iterahq/activity-spec';
import type { CodeCheckResult } from '@/types/codeSnack';

/**
 * The per-check verdict list inside the feedback screen.
 *
 * `hint` is revealed ONLY on the lines that failed — a hint next to something
 * the learner already got right is noise, and the gate for hints is the submit
 * itself rather than a timer.
 */
export function CodeChecksList({
  checks,
  results,
}: {
  checks: CodeCheck[];
  results: CodeCheckResult[];
}) {
  return (
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
  );
}
