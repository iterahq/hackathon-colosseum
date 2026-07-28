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
 * It renders only when there IS a tenant admin who could read — a learner with
 * no tenant membership sees nothing, because for them the statement is false.
 */
import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { useI18n } from '@/i18n';
import { hasTenantAudience } from '@/services/artifact.service';

export function ArtifactVisibilityNotice() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let alive = true;
    hasTenantAudience()
      .then((yes) => {
        if (alive) setVisible(yes);
      })
      .catch(() => {
        /* stay hidden — never claim a reader exists when we cannot confirm it */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!visible) return null;

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
