import { safeParseActivitySpec } from '@iterahq/activity-spec';
import type { Activity } from '@/types/content';
import type { ActivityCompleteDetail } from '../activityFeedbackKinds';
import { KIND_VALIDATION } from '@/utils/activitySpecBoundary';
import { InvalidSpecCard } from '../InvalidSpecCard';
import { CodeSnackPane } from './CodeSnackPane';

/**
 * `code` — a single-file, client-only React code snack. Validates the spec
 * against the shared Zod schema (a friendly card on an authoring mistake instead
 * of a crash), then hands off to the split-pane surface: Monaco on the left, a
 * live preview (sucrase-transpiled, inside a sandboxed iframe) on the right.
 *
 * The source is autosaved (debounced) to `localStorage` while the learner works,
 * and the SETTLED source rides up with the verdict as `detail.response` — until
 * that second half existed, a code attempt recorded a boolean and the work
 * itself never left the machine.
 */
export function CodeSnackActivity({
  activity,
  onComplete,
}: {
  activity: Activity;
  /** Carries the learner's source up as `detail.response` — see `useCodeSnack`. */
  onComplete: (correct: boolean, detail?: ActivityCompleteDetail) => void;
}) {
  // `site: 'component'` no registro da fronteira: o `code` valida AQUI, do jeito
  // histórico, porque este componente também é renderizado direto (fora do
  // `ActivityRenderer`) por stories e testes. Mesmo card, mesmo testid.
  const parsed = safeParseActivitySpec('code', activity.spec);
  if (!parsed.success) {
    return (
      <InvalidSpecCard
        kind="code"
        testId={KIND_VALIDATION.code.invalidTestId}
        messageKey={KIND_VALIDATION.code.messageKey}
      />
    );
  }
  return <CodeSnackPane activity={activity} spec={parsed.data} onComplete={onComplete} />;
}
