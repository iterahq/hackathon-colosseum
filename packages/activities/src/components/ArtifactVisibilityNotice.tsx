/**
 * Tells the learner, AT THE MOMENT THEY WRITE, that what they type is saved and
 * who can read it.
 *
 * Plan: 20260728-itera-artifact-storage — ADR-9 (plan Q2 = B).
 *
 * WHY THIS COMPONENT EXISTS: the tenant admin — in practice the learner's
 * EMPLOYER — can read every artifact produced under their tenant, including
 * personal reflections like "what did you not understand in this lesson". That
 * was a deliberate product decision, chosen over the narrower "only activities
 * marked as deliverable" option, with the privacy cost spelled out.
 *
 * The decision is legitimate. Shipping it SILENTLY would not be: a learner who
 * believes a reflection is private, and writes candidly because of that belief,
 * is being misled by omission. So the notice is plain, visible, adjacent to the
 * input — not buried in terms of service. It is the mitigation that makes the
 * decision honest, and it ships in the same PR as the policy that enables it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT CHANGED WHEN IT CROSSED INTO THE PACKAGE (Fase D)
 * ─────────────────────────────────────────────────────────────────────────────
 * In the Player this component called `hasTenantAudience()` from
 * `@/services/artifact.service` — i.e. it queried Supabase from inside the
 * activity tree, on mount, once per document activity. A library cannot hold a
 * Supabase client, so the HOST resolves the fact and passes the answer through
 * `identity.artifactAudience`. That port was written for exactly this in Fase A
 * (`ports.ts` names this component by name); Fase D is where it becomes live.
 *
 * The FAIL-CLOSED behaviour is preserved bit for bit, and it is the whole point
 * of the component: the old code started hidden, showed itself only when the
 * promise resolved `true`, and swallowed every error. Here, anything that is
 * not the literal `'tenant'` — `'none'`, `'unknown'`, an absent `identity`, an
 * absent provider — keeps it hidden. **Never claim a reader exists when we
 * cannot confirm it**: a false notice teaches the learner to distrust a true
 * one.
 */
import { Info } from 'lucide-react';
import { useActivityHost, useActivityI18n } from '../context.js';

export function ArtifactVisibilityNotice() {
  const { t } = useActivityI18n();
  const { identity } = useActivityHost();

  if (identity?.artifactAudience !== 'tenant') return null;

  return (
    <p
      data-testid="artifact-visibility-notice"
      className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{t('activity.artifactVisibilityNotice')}</span>
    </p>
  );
}
