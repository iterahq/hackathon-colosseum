/**
 * Replay INDEX — the attempts this tenant admin may watch.
 *
 * Plan `20260803-itera-replay-de-sessao-de-atividade`, Fase 1.
 *
 * Mounted under `/admin`, which is already `RequireAuth → RequireRole
 * tenant_admin` (App.tsx). That route guard is the FIRST of the two gates; the
 * load-bearing one is in `replay.service.ts`, which refuses to query at all
 * unless the caller administers a real tenant, and scopes every read to that
 * tenant's learners. See that module's header for why an instructor is excluded
 * here while keeping the ordinary result read they have always had.
 *
 * READ-ONLY, and structurally so: nothing in this subtree imports
 * `progress.service`, and the only data call it makes is a `select`.
 */
import { Link } from 'react-router-dom';
import { PlayCircle, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useReplayIndex } from '@/hooks/useReplay';
import { AdminEmpty, AdminError, AdminLoading } from './AdminStates';

export default function ReplayPage() {
  const { t } = useI18n();
  const { data, isPending, isError, refetch } = useReplayIndex();

  if (isPending) return <AdminLoading />;
  if (isError) return <AdminError onRetry={() => void refetch()} />;

  const rows = data ?? [];
  if (rows.length === 0) return <AdminEmpty message={t('replay.empty')} />;

  return (
    <div className="space-y-4" data-testid="replay-index">
      <p className="text-sm text-muted-foreground">{t('replay.hint')}</p>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.traceId}>
            <Link
              to={`/admin/replay/${row.traceId}`}
              data-testid="replay-index-row"
              className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 hover:border-menta transition-colors"
            >
              <PlayCircle className="h-5 w-5 shrink-0 text-menta" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {row.learnerName || row.userId}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {row.kind ?? t('replay.unknownKind')} ·{' '}
                  {t('replay.actionCount', { n: row.actionCount })}
                  {row.outcome === 'abandoned' ? ` · ${t('replay.abandoned')}` : ''}
                </div>
              </div>
              {/* The missing enunciado is surfaced HERE and not only in the
                  detail, so an admin can see at a glance which attempts predate
                  migration 0037 and are therefore only partially reproducible. */}
              {!row.enunciadoCaptured && (
                <span
                  data-testid="replay-index-no-snapshot"
                  title={t('replay.enunciado.missingShort')}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  <AlertTriangle className="h-3 w-3" />
                  {t('replay.enunciado.missingShort')}
                </span>
              )}
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                {row.startedAt ? new Date(row.startedAt).toLocaleString() : '—'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
