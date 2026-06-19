/**
 * Admin view 1 — Learner roster (plan #6 Phase 4.1).
 * The tenant's learners + completion% over the tenant's activities. Read-only.
 */
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useAdminRoster } from '@/hooks/useAdmin';
import { useAdminTenant } from './AdminLayout';
import { AdminLoading, AdminError, AdminEmpty, AdminNoTenant } from './AdminStates';

function relTime(iso: string | null, t: (k: string, v?: Record<string, string>) => string): string {
  if (!iso) return t('admin.never');
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return t('admin.never');
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return t('admin.today');
  if (days === 1) return t('admin.yesterday');
  return t('admin.daysAgo', { n: String(days) });
}

export default function RosterPage() {
  const { t } = useI18n();
  const tenantId = useAdminTenant();
  const { data, isPending, isError, refetch } = useAdminRoster(tenantId);

  if (!tenantId) return <AdminNoTenant />;
  if (isPending) return <AdminLoading />;
  if (isError) return <AdminError onRetry={() => refetch()} />;
  if (!data || data.length === 0) return <AdminEmpty message={t('admin.roster.empty')} />;

  return (
    <div data-testid="admin-roster">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <SummaryTile label={t('admin.roster.learners')} value={data.length} icon={Users} />
        <SummaryTile
          label={t('admin.roster.avgCompletion')}
          value={`${Math.round(data.reduce((s, l) => s + l.completionPct, 0) / data.length)}%`}
        />
        <SummaryTile
          label={t('admin.roster.active')}
          value={data.filter((l) => l.activitiesDone > 0).length}
        />
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[12px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="px-4 py-3 font-medium">{t('admin.col.learner')}</th>
              <th className="px-4 py-3 font-medium">{t('admin.col.completion')}</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">{t('admin.col.activities')}</th>
              <th className="px-4 py-3 font-medium">{t('admin.col.lastActive')}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((l, i) => (
              <motion.tr
                key={l.userId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="border-b border-border last:border-0 hover:bg-obsidiana/40 transition-colors"
                data-testid="roster-row"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-menta to-verde-tech text-obsidiana font-display font-bold flex items-center justify-center text-xs">
                      {(l.name || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate" data-testid="roster-name">{l.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{l.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden max-w-[120px]">
                      <div
                        className="h-full bg-gradient-to-r from-menta to-verde-tech rounded-full"
                        style={{ width: `${l.completionPct}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground w-9">{l.completionPct}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground tabular-nums">
                  {l.activitiesDone}/{l.activitiesTotal}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{relTime(l.lastActive, t)}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon?: typeof Users;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {Icon && <Icon className="w-4 h-4 text-menta" />}
      <div className="font-display font-bold text-2xl mt-2 tabular-nums">{value}</div>
      <div className="text-[12px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
