/**
 * Where the tree on screen actually came from.
 *
 * A degraded generation is served with HTTP 200 and renders like any other
 * activity (ADR-7), so an author reading the screen cannot tell a real model roll
 * from the authored fallback. The row already carries the answer — the client was
 * throwing it away.
 *
 * Elapsed time is measured on the CLIENT and shown next to the verdict because it
 * is the tell that survives a wrong `fallback_used`: real generation measured
 * 26–73s in production, so a "generation" that returned in three seconds never
 * called a model.
 */
import { Sparkles, PackageOpen } from 'lucide-react';
import { Badge } from '@devfellowship/components';
import { useI18n } from '@/i18n';
import type { ByocGeneration } from '@/types/byoc';

export function ByocAuthorProvenance({
  row,
  elapsedMs,
}: {
  row: ByocGeneration;
  /** Only for a roll THIS session made — a read-back row has no honest timing. */
  elapsedMs: number | null;
}) {
  const { t } = useI18n();
  const fallback = row.fallback_used;

  return (
    <div
      className="flex flex-wrap items-center gap-2 text-xs"
      data-testid="byoc-author-provenance"
      data-fallback={fallback ? 'true' : 'false'}
    >
      <Badge variant={fallback ? 'destructive' : 'secondary'} className="gap-1">
        {fallback ? <PackageOpen className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
        {t(fallback ? 'authorTest.byoc.origin.fallback' : 'authorTest.byoc.origin.model')}
      </Badge>
      {row.model && <span className="font-mono text-muted-foreground">{row.model}</span>}
      {elapsedMs !== null && (
        <span className="font-mono text-muted-foreground" data-testid="byoc-author-elapsed">
          {t('authorTest.byoc.origin.elapsed', { s: Math.round(elapsedMs / 1000) })}
        </span>
      )}
      {row.attempts_used > 1 && (
        <span className="text-muted-foreground">
          {t('authorTest.byoc.origin.attempts', { n: row.attempts_used })}
        </span>
      )}
      {row.degraded_reason && (
        <code className="font-mono text-destructive" data-testid="byoc-author-degraded">
          {row.degraded_reason}
        </code>
      )}
    </div>
  );
}
