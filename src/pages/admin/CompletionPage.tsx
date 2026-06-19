/**
 * Admin view 2 — Completion per program/cohort (plan #6 Phase 4.2).
 * Per-program completed/total ACTIVITY ratio (ADR-8 v1 definition). Read-only.
 */
import { motion } from 'framer-motion';
import { BarChart3, BookOpen } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useAdminCompletion } from '@/hooks/useAdmin';
import { useAdminTenant } from './AdminLayout';
import { AdminLoading, AdminError, AdminEmpty, AdminNoTenant } from './AdminStates';

export default function CompletionPage() {
  const { t, tText } = useI18n();
  const tenantId = useAdminTenant();
  const { data, isPending, isError, refetch } = useAdminCompletion(tenantId);

  if (!tenantId) return <AdminNoTenant />;
  if (isPending) return <AdminLoading />;
  if (isError) return <AdminError onRetry={() => refetch()} />;
  if (!data || data.length === 0) return <AdminEmpty message={t('admin.completion.empty')} />;

  return (
    <div className="space-y-4" data-testid="admin-completion">
      {data.map((p, i) => (
        <motion.div
          key={p.programId}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          className="rounded-2xl border border-border bg-card p-5"
          data-testid="completion-row"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-verde-floresta/60 border border-border flex items-center justify-center text-menta">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] uppercase tracking-wider text-muted-foreground">
                {t('label.program')}
              </div>
              <div className="font-display font-semibold truncate">
                {tText(p.title) || p.slug}
              </div>
            </div>
            <div className="text-right">
              <div className="font-display font-bold text-2xl text-menta tabular-nums" data-testid="completion-pct">
                {p.completionPct}%
              </div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {t('admin.completion.label')}
              </div>
            </div>
          </div>

          <div className="h-2.5 rounded-full bg-muted overflow-hidden mb-4">
            <motion.div
              className="h-full bg-evergreen rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${p.completionPct}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <Metric icon={BarChart3} value={p.activitiesTotal} label={t('admin.completion.activities')} />
            <Metric value={p.enrolled} label={t('admin.completion.enrolled')} />
            <Metric value={p.active} label={t('admin.completion.activeLearners')} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function Metric({
  value,
  label,
  icon: Icon,
}: {
  value: number;
  label: string;
  icon?: typeof BarChart3;
}) {
  return (
    <div className="rounded-xl bg-obsidiana/60 border border-border p-3">
      {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground mx-auto" />}
      <div className="font-display font-bold text-xl mt-1 tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
