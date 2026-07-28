/**
 * `/admin/artifacts` — the TENANT OWNER's view of what learners produced.
 *
 * Plan: 20260728-itera-artifact-storage (Phase 3, item 11). Tainan:
 * *"o dono do tenant vai ver os arquivos persistidos. Como ele veria isso lá."*
 *
 * It reuses the SAME `ArtifactBrowser` as the learner's `/artifacts`, so the
 * folder structure an owner reads is byte-for-byte the one that will be
 * committed in Phase 4 — the two surfaces cannot drift.
 *
 * ⚠️ PRIVACY — read this before extending the page.
 * ADR-9 (plan Q2 = B) grants the tenant admin read access to EVERY artifact
 * produced under the tenant, deliberately including personal reflections rather
 * than only activities marked as deliverable. That decision stands, and it is
 * enforced in the database by `artifacts_read_tenant_admin`. What makes it
 * defensible rather than a betrayal is that the learner is TOLD, at the moment
 * they write, by `ArtifactVisibilityNotice`. The banner below is the same claim
 * restated to the person doing the reading — if you ever add a surface that
 * widens this audience, the notice on the learner's side has to change first.
 *
 * Deliberately built on `useAdminTenant()` (the layout's context) rather than
 * re-deriving the tenant: no page under /admin may pick its own tenant.
 */
import { motion } from 'framer-motion';
import { Eye } from 'lucide-react';
import { useMemo } from 'react';
import { ArtifactBrowser } from '@/components/artifacts/ArtifactBrowser';
import { useTenantArtifacts } from '@/hooks/useArtifacts';
import { useAdminRoster } from '@/hooks/useAdmin';
import { useI18n } from '@/i18n';
import type { StoredArtifact } from '@/services/artifact.service';
import { useAdminTenant } from './AdminLayout';
import { AdminEmpty, AdminError, AdminLoading, AdminNoTenant } from './AdminStates';

export default function AdminArtifactsPage() {
  const { t } = useI18n();
  const tenantId = useAdminTenant();
  const { data, isPending, isError, refetch } = useTenantArtifacts(tenantId);
  // The roster is already fetched (and cached) for the sibling tabs; reusing it
  // turns user_id into a human name without a second query or a join that RLS
  // would have to be re-reasoned about.
  const { data: roster } = useAdminRoster(tenantId);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const learner of roster ?? []) map.set(learner.userId, learner.name);
    return map;
  }, [roster]);

  const ownerLabelFor = useMemo(
    () => (artifact: StoredArtifact) =>
      nameById.get(artifact.userId) ?? artifact.userId.slice(0, 8),
    [nameById]
  );

  if (!tenantId) return <AdminNoTenant />;
  if (isPending) return <AdminLoading />;
  if (isError) return <AdminError onRetry={() => refetch()} />;

  return (
    <div data-testid="admin-artifacts-page">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-warning/30 bg-warning/10 p-4 flex gap-3"
        data-testid="admin-artifacts-privacy-notice"
      >
        <Eye className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
        <p className="text-sm text-muted-foreground">{t('admin.artifacts.privacy')}</p>
      </motion.div>

      {(data?.length ?? 0) === 0 ? (
        <div className="mt-5">
          <AdminEmpty message={t('admin.artifacts.empty')} />
        </div>
      ) : (
        <div className="mt-5">
          <ArtifactBrowser artifacts={data ?? []} ownerLabelFor={ownerLabelFor} />
        </div>
      )}
    </div>
  );
}
