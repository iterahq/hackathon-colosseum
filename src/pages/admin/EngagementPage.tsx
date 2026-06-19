/**
 * Admin view 3 — Engagement signals (plan #6 Phase 4.3).
 * Completion COUNT + last-active RECENCY only (ADR-4/ADR-8 — the signals present
 * in the Itera schema). NO raw scores (ADR-5/ADR-15). Read-only.
 *
 * Rendered as a compact engagement strip: a recency heat dot + completion-count
 * bar per learner — consistent with the fluid-heatmap signal family, no grades.
 */
import { motion } from 'framer-motion';
import { useI18n } from '@/i18n';
import { useAdminEngagement } from '@/hooks/useAdmin';
import { useAdminTenant } from './AdminLayout';
import { AdminLoading, AdminError, AdminEmpty, AdminNoTenant } from './AdminStates';

/** Recency → heat color (greener = more recent). */
function heatClass(iso: string | null): string {
  if (!iso) return 'bg-muted';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return 'bg-muted';
  if (days <= 1) return 'bg-menta';
  if (days <= 3) return 'bg-verde-tech';
  if (days <= 7) return 'bg-verde-floresta';
  return 'bg-muted';
}

function recencyLabel(iso: string | null, t: (k: string, v?: Record<string, string>) => string): string {
  if (!iso) return t('admin.never');
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return t('admin.never');
  if (days <= 0) return t('admin.today');
  if (days === 1) return t('admin.yesterday');
  return t('admin.daysAgo', { n: String(days) });
}

export default function EngagementPage() {
  const { t } = useI18n();
  const tenantId = useAdminTenant();
  const { data, isPending, isError, refetch } = useAdminEngagement(tenantId);

  if (!tenantId) return <AdminNoTenant />;
  if (isPending) return <AdminLoading />;
  if (isError) return <AdminError onRetry={() => refetch()} />;
  if (!data || data.length === 0) return <AdminEmpty message={t('admin.engagement.empty')} />;

  const maxCompletions = Math.max(1, ...data.map((d) => d.completions));

  return (
    <div data-testid="admin-engagement">
      <p className="text-sm text-muted-foreground mb-4">{t('admin.engagement.hint')}</p>
      <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
        {data.map((d, i) => (
          <motion.div
            key={d.userId}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="flex items-center gap-4 px-4 py-3 hover:bg-obsidiana/40 transition-colors"
            data-testid="engagement-row"
          >
            <span
              className={`w-3 h-3 rounded-full shrink-0 ${heatClass(d.lastActive)}`}
              title={recencyLabel(d.lastActive, t)}
              data-testid="engagement-heat"
            />
            <div className="w-40 min-w-0">
              <div className="font-medium truncate">{d.name}</div>
              <div className="text-xs text-muted-foreground">{recencyLabel(d.lastActive, t)}</div>
            </div>
            <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-evergreen rounded-full"
                style={{ width: `${(d.completions / maxCompletions) * 100}%` }}
              />
            </div>
            <span className="text-sm tabular-nums text-muted-foreground w-20 text-right" data-testid="engagement-count">
              {d.completions} {t('admin.engagement.done')}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
