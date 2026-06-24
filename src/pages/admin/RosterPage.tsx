/**
 * Admin view 1 — Learner roster (plan #6 Phase 4.1).
 * The tenant's learners + completion% over the tenant's activities. Read-only.
 */
import { motion } from 'framer-motion';
import { Users, TrendingUp, Activity, ListChecks } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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

  const avgCompletion = Math.round(data.reduce((s, l) => s + l.completionPct, 0) / data.length);
  const activeCount = data.filter((l) => l.activitiesDone > 0).length;
  const totalActivitiesDone = data.reduce((s, l) => s + l.activitiesDone, 0);
  // Recent activity feed — learners ordered by most recent lastActive (real data).
  const recent = [...data]
    .filter((l) => l.lastActive)
    .sort((a, b) => new Date(b.lastActive!).getTime() - new Date(a.lastActive!).getTime())
    .slice(0, 5);

  return (
    <div data-testid="admin-roster">
      {/* KPI cards — 4 colorful tiles (parity with his Admin Overview) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard
          label={t('admin.roster.learners')}
          value={data.length}
          icon={Users}
          color="evergreen"
        />
        <KpiCard
          label={t('admin.roster.avgCompletion')}
          value={`${avgCompletion}%`}
          icon={TrendingUp}
          color="warning"
        />
        <KpiCard label={t('admin.roster.active')} value={activeCount} icon={Activity} color="menta" />
        <KpiCard
          label={t('admin.col.activities')}
          value={totalActivitiesDone}
          icon={ListChecks}
          color="streak"
        />
      </div>

      {/* Two-column: completion-distribution chart + recent activity feed */}
      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4 mb-6">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="font-display font-semibold mb-4">{t('admin.chart.completion')}</div>
          <div className="flex items-end gap-2 h-36">
            {data.slice(0, 12).map((l) => (
              <div key={l.userId} className="flex-1 flex flex-col items-center justify-end gap-1.5">
                <div
                  className="w-full rounded-t bg-gradient-to-t from-evergreen-soft to-evergreen min-h-[2px]"
                  style={{ height: `${Math.max(2, l.completionPct)}%` }}
                  title={`${l.name}: ${l.completionPct}%`}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="font-display font-semibold mb-3">{t('admin.recent.title')}</div>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('admin.recent.empty')}</p>
          ) : (
            <ul className="space-y-3">
              {recent.map((l) => (
                <li key={l.userId} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-evergreen-soft border border-evergreen/40 text-evergreen-hi font-display font-bold flex items-center justify-center text-xs flex-shrink-0">
                    {(l.name || '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">
                      <span className="font-medium">{l.name}</span>{' '}
                      <span className="text-muted-foreground">
                        — {l.activitiesDone} {t('label.activities').toLowerCase()}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {relTime(l.lastActive, t)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* overflow-x-auto (not -hidden) so the table scrolls on narrow screens
          instead of clipping the completion column; min-w keeps columns legible. */}
      <div className="rounded-2xl border border-border bg-card overflow-x-auto scrollbar-hide">
        <table className="w-full min-w-[520px] text-sm">
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
                    <div className="w-8 h-8 rounded-full bg-evergreen-soft border border-evergreen/40 text-evergreen-hi font-display font-bold flex items-center justify-center text-xs">
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
                        className="h-full bg-evergreen rounded-full"
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

const KPI_COLOR: Record<string, { icon: string; chip: string }> = {
  evergreen: { icon: 'text-evergreen-hi', chip: 'bg-evergreen/10 border-evergreen/30' },
  warning: { icon: 'text-warning', chip: 'bg-warning/10 border-warning/25' },
  menta: { icon: 'text-menta', chip: 'bg-menta/10 border-menta/25' },
  streak: { icon: 'text-streak', chip: 'bg-streak/10 border-streak/25' },
};

function KpiCard({
  label,
  value,
  icon: Icon,
  color = 'evergreen',
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: keyof typeof KPI_COLOR;
}) {
  const c = KPI_COLOR[color] ?? KPI_COLOR.evergreen;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${c.chip}`}>
        <Icon className={`w-4 h-4 ${c.icon}`} />
      </div>
      <div className="font-display font-bold text-2xl md:text-3xl mt-3 tabular-nums">{value}</div>
      <div className="text-[12px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
