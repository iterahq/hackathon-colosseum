/**
 * Activity renderer — dispatches an `itera.activities` row to the right view by
 * `kind`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS LEFT IN THIS FILE, AFTER FASE D
 * ─────────────────────────────────────────────────────────────────────────────
 * This file used to be ~700 lines, and most of them were not dispatch: three
 * kinds (`document`, `diagram`, `quiz`) lived here as inline FUNCTIONS rather
 * than files, which is exactly why Fase C of plan
 * `20260803-itera-player-activities-lib` moved seven kinds and left those three
 * behind — `packages/activities/CONTRACT.md` finding 4 recorded that lifting
 * them touches the one file every other open PR touches.
 *
 * Fase D lifted them. What remains here is the Player's own dispatch, and every
 * line of it is a PLAYER concern that ADR-1 keeps out of the package:
 *
 *  · the BYOC layer resolution — BYOC is a LAYER over any host kind, resolved
 *    from the spec before the kind switch;
 *  · the fail-closed spec VALIDATION boundary (`activitySpecBoundary`), which
 *    belongs BEFORE a renderer: `PortableActivity.spec` is documented as
 *    already validated;
 *  · the kinds that have NOT crossed (`code`, the live/AI sandbox half) and the
 *    `sandbox_scenario` guard.
 *
 * ⚠️ THE KIND SWITCH BELOW IS NOT THE PACKAGE'S DISPATCHER, AND MUST NOT BECOME
 * IT BY DRIFT. `@iterahq/activities` exports its own `<ActivityRenderer>` with
 * the same name; this one wraps the app's extra layers around it. When the last
 * un-extracted kind crosses, this file should DELEGATE to the package's
 * dispatcher rather than keep a parallel switch — a second switch that agrees
 * today is a second switch that disagrees later, silently, for one kind.
 *
 * `spec` shapes for the three that just moved now live with them, as declared
 * interfaces, in `packages/activities/src/specs.ts` — no longer as `as` casts
 * written at the top of a function.
 */
import { safeParseActivitySpec } from '@iterahq/activity-spec';
import { useI18n } from '@/i18n';
import type { Activity } from '@/types/content';
import { KIND_VALIDATION, specBoundaryFailure } from '@/utils/activitySpecBoundary';
import type { ActivityCompleteDetail } from './activityFeedbackKinds';
// v1 general learning-activity taxonomy (plan 20260703). These CONVERGE on the
// shared InstructionPanel primitive + the `onComplete(correct)` contract.
import { ConceptActivity } from './ConceptActivity';
import { ConceptRevealActivity } from './ConceptRevealActivity';
import { VideoActivity } from './VideoActivity';
import { SingleChoiceActivity } from './SingleChoiceActivity';
import { MultiChoiceActivity } from './MultiChoiceActivity';
import { MatchActivity } from './MatchActivity';
import { OrderActivity } from './OrderActivity';
import { SandboxScenarioActivity } from './SandboxScenarioActivity';
// Fase D — the three that were inline in this file until now. Imported through
// the app's own paths (one-line re-exports of `@iterahq/activities`) for the
// same reason every Fase C kind is: the extraction is meant to be invisible
// here, and a PR that also rewrote the import sites would have mixed "did the
// move change behaviour?" with "did the rename change behaviour?".
import { DocumentActivity } from './DocumentActivity';
import { DiagramActivity } from './DiagramActivity';
import { QuizActivity } from './QuizActivity';
import { CodeSnackActivity } from './code/CodeSnackActivity';
import { ByocActivity } from './byoc/ByocActivity';
import { InvalidSpecCard } from './InvalidSpecCard';
import { resolveByocSpec } from './byoc/byocSpec';

export function ActivityRenderer({
  activity,
  onComplete,
  reveal = false,
  live = false,
}: {
  activity: Activity;
  /**
   * `detail` carries the richer verdict AND the produced content / answer
   * summary. It was already being passed by the document activities since PR
   * #191, but the type said otherwise — a latent `TS2554` that only stayed
   * invisible because `npm run build` is `vite build` (no typecheck).
   */
  onComplete: (correct: boolean, detail?: ActivityCompleteDetail) => void;
  /** Reveal the correct answer (timer stopped/expired) even without a submission. */
  reveal?: boolean;
  /**
   * Live class vs. self-paced. Only the `code` snack reads it today, to gate the
   * "seguir mesmo assim" skip on a failed practical (live only).
   */
  live?: boolean;
}) {
  // BYOC is a LAYER, not a kind: an activity of ANY kind whose spec carries an
  // authored harness is generated from the learner's own context first.
  const { locale } = useI18n();
  const byoc = resolveByocSpec(activity, locale);
  if (byoc) {
    return <ByocActivity activity={activity} spec={byoc} onComplete={onComplete} reveal={reveal} />;
  }

  // FRONTEIRA DE VALIDAÇÃO DE SPEC — fail-closed nos 12 kinds (estado F).
  // Fica DEPOIS do ramo BYOC de propósito: BYOC é uma CAMADA, não um kind, e o
  // spec dele é validado pelo `ByocSpecSchema`, não pelo schema do kind
  // hospedeiro. `code` e `sandbox_scenario` continuam validando dentro do
  // próprio componente (`site: 'component'`), com os testids históricos
  // intactos. Racional completo + medição (246/246 specs reais passam) em
  // `src/utils/activitySpecBoundary.ts`.
  const invalidSpec = specBoundaryFailure(activity);
  if (invalidSpec) {
    return (
      <InvalidSpecCard
        kind={invalidSpec.kind}
        testId={invalidSpec.invalidTestId}
        messageKey={invalidSpec.messageKey}
      />
    );
  }

  switch (activity.kind) {
    case 'document':
      return <DocumentActivity activity={activity} onComplete={onComplete} />;
    case 'diagram':
      return <DiagramActivity activity={activity} onComplete={onComplete} />;
    case 'quiz':
      return <QuizActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    case 'code':
      return <CodeSnackActivity activity={activity} onComplete={onComplete} />;
    // v1 general learning-activity taxonomy:
    case 'concept':
      return <ConceptActivity activity={activity} onComplete={onComplete} />;
    case 'concept_reveal':
      return (
        <ConceptRevealActivity
          activity={activity}
          onComplete={onComplete}
          live={live}
          reveal={reveal}
        />
      );
    case 'video':
      return <VideoActivity activity={activity} onComplete={onComplete} />;
    case 'single_choice':
      return <SingleChoiceActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    case 'multi_choice':
      return <MultiChoiceActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    case 'match':
      return <MatchActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    case 'order':
      return <OrderActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    case 'sandbox_scenario':
      return <SandboxScenarioGuard activity={activity} onComplete={onComplete} reveal={reveal} />;
    default:
      return <UnknownActivity activity={activity} />;
  }
}

/**
 * Validate the sandbox `spec` against the shared per-kind Zod schema before
 * handing it to the runtime — an authoring mistake renders a friendly card
 * instead of a runtime crash. Valid specs pass straight through.
 */
function SandboxScenarioGuard({
  activity,
  onComplete,
  reveal,
}: {
  activity: Activity;
  onComplete: (c: boolean) => void;
  reveal?: boolean;
}) {
  const parsed = safeParseActivitySpec('sandbox_scenario', activity.spec);
  if (!parsed.success) {
    // Mesmo card, mesmo testid — agora pela primitiva compartilhada (a mensagem
    // saiu do literal PT hardcoded para o i18n, sem mudar o texto pt-BR).
    return (
      <InvalidSpecCard
        kind="sandbox_scenario"
        testId={KIND_VALIDATION.sandbox_scenario.invalidTestId}
        messageKey={KIND_VALIDATION.sandbox_scenario.messageKey}
      />
    );
  }
  return <SandboxScenarioActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
}

function UnknownActivity({ activity }: { activity: Activity }) {
  return (
    <div
      className="rounded-3xl border border-border bg-card p-8 text-center text-muted-foreground"
      data-activity-kind="unknown"
    >
      Unsupported activity kind: {activity.kind}
    </div>
  );
}
