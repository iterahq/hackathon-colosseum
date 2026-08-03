/**
 * Why a BYOC activity is NOT rendering as BYOC, for the author testing it.
 *
 * The resolver collapses every failure into "not BYOC" (ADR-7: never a 500 in the
 * learner's face), so a refused harness still renders the authored fallback — a
 * working-looking activity. For the learner that silence is right; for the author
 * it means the edit-test loop reports nothing at all.
 */
import { AlertTriangle } from 'lucide-react';
import type { ByocDiagnosis } from '@/components/branded/activity/byoc/byocSpec';
import { useI18n } from '@/i18n';

export function ByocAuthorDiagnosis({ diagnosis }: { diagnosis: ByocDiagnosis }) {
  const { t } = useI18n();
  if (diagnosis.state === 'ok' || diagnosis.state === 'absent') return null;

  return (
    <div
      className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
      data-testid="byoc-author-diagnosis"
      data-byoc-state={diagnosis.state}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <div className="flex flex-col gap-1">
        <span className="font-semibold">
          {t(
            diagnosis.state === 'invalid'
              ? 'authorTest.byoc.diag.invalid'
              : 'authorTest.byoc.diag.apiMissing'
          )}
        </span>
        {diagnosis.state === 'invalid' && (
          <code className="text-xs font-mono text-muted-foreground">{diagnosis.reason}</code>
        )}
      </div>
    </div>
  );
}
