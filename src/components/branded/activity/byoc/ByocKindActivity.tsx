/**
 * The three BYOC kinds — `byoc_pick_best`, `byoc_judge_each`,
 * `byoc_build_context` (plan `20260924-activity-type-one-behavior-rule`,
 * ADR-4, T13).
 *
 * `spec.byoc` was a LAYER: it rode on ANY host kind and replaced its render
 * with one of three interactions picked by `harness.interaction`. Worse, with
 * the itera-api unconfigured the layer resolved to nothing and the HOST kind
 * rendered instead — a `concept` card where the author wrote a BYOC exercise.
 * Both switches are gone for these kinds:
 *
 *  - the KIND names the interaction. A spec whose harness says another one is
 *    the invalid-spec card, never the other interaction;
 *  - with no itera-api the kind renders `byoc-unavailable`, an explicit state,
 *    never the host kind's card (the rule's "no host-dependent behaviour").
 *
 * The components (`ByocActivity` → `ByocActivityView`) are the ones the layer
 * uses, unchanged: a remapped row looks exactly as it did.
 */
import { kindInvalidTestId } from '@iterahq/activities';
import { useI18n } from '@/i18n';
import type { Activity } from '@/types/content';
import { specBoundaryFailure } from '@/utils/activitySpecBoundary';
import type { ActivityCompleteDetail } from '../activityFeedbackKinds';
import { InvalidSpecCard } from '../InvalidSpecCard';
import { ByocActivity } from './ByocActivity';
import { diagnoseByoc } from './byocSpec';

/** The kind → the one `harness.interaction` it accepts. */
export const BYOC_KIND_INTERACTION = {
  byoc_pick_best: 'pick_best',
  byoc_judge_each: 'judge_each',
  byoc_build_context: 'build_context',
} as const;

export type ByocKind = keyof typeof BYOC_KIND_INTERACTION;

export function isByocKind(kind: string): kind is ByocKind {
  return kind in BYOC_KIND_INTERACTION;
}

export function ByocKindActivity({
  activity,
  onComplete,
  reveal = false,
}: {
  activity: Activity;
  onComplete: (correct: boolean, detail?: ActivityCompleteDetail) => void;
  reveal?: boolean;
}) {
  const { t, locale } = useI18n();
  const kind = activity.kind as ByocKind;

  const invalid = specBoundaryFailure(activity);
  if (invalid) {
    return <InvalidSpecCard kind={invalid.kind} testId={invalid.invalidTestId} messageKey={invalid.messageKey} />;
  }

  const diagnosis = diagnoseByoc(activity, locale);
  if (diagnosis.state === 'api-missing') {
    return (
      <div
        className="rounded-3xl border border-border bg-card p-8 text-center text-muted-foreground"
        data-testid="byoc-unavailable"
        data-activity-kind={kind}
        data-port-unavailable="itera-api"
      >
        {t('byoc.kindUnavailable')}
      </div>
    );
  }
  const interaction = diagnosis.state === 'ok' ? diagnosis.spec.harness.interaction : null;
  if (diagnosis.state !== 'ok' || interaction !== BYOC_KIND_INTERACTION[kind]) {
    return (
      <InvalidSpecCard kind={kind} testId={kindInvalidTestId(kind)} messageKey="activity.specInvalid" />
    );
  }
  return <ByocActivity activity={activity} spec={diagnosis.spec} onComplete={onComplete} reveal={reveal} />;
}
