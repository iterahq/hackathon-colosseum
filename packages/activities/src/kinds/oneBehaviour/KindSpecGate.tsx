/**
 * The spec gate every one-behaviour kind renders through (plan
 * `20260924-activity-type-one-behavior-rule`, T9–T14).
 *
 * The Itera Player validates these kinds at its boundary BEFORE the renderer
 * (`activitySpecBoundary.ts`, `site: 'boundary'`). A host that mounts the
 * package's `<ActivityRenderer>` or a kind component directly has no boundary,
 * so the kind validates again here: a spec that does not fit the kind is an
 * explicit, inert card — never a sub-renderer picked from the spec's shape.
 * Same testid either way (`<kind-with-dashes>-invalid`), so a test cannot tell
 * which layer caught it and does not need to.
 */
import type { ReactNode } from 'react';
import { useActivityI18n } from '../../context.js';
import { kindInvalidTestId, safeParseKindSpec } from '../../oneBehaviourKinds.js';

export function KindInvalidCard({ kind }: { kind: string }) {
  const { t } = useActivityI18n();
  return (
    <div
      className="rounded-3xl border border-border bg-card p-8 text-center text-muted-foreground"
      data-testid={kindInvalidTestId(kind)}
      data-activity-kind={kind}
      data-invalid-spec="true"
    >
      {t('activity.specInvalid')}
    </div>
  );
}

export function KindSpecGate({
  kind,
  spec,
  children,
}: {
  kind: string;
  spec: unknown;
  children: ReactNode;
}) {
  if (!safeParseKindSpec(kind, spec).success) return <KindInvalidCard kind={kind} />;
  return <>{children}</>;
}
