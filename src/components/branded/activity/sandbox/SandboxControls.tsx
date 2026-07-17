import type { Locale, Scenario } from '@iterahq/activity-spec/runtime';
import { SandboxSlotPanel } from './SandboxSlotPanel';
import { SandboxChoiceChips } from './SandboxChoiceChips';
import { SandboxEvalPanel } from './SandboxEvalPanel';
import type { useSandboxScenario } from './useSandboxScenario';

/**
 * The BOTTOM zone — response-option chips (compose mode) or the rating panel
 * (evaluate mode), rendered OUTWARD/below the sandbox window. The composer
 * itself (+ the step label/prompt/hint) now lives elsewhere — the composer
 * INSIDE the window, the instruction ABOVE it (see `SandboxScenarioActivity`,
 * plan 20260717-iterahq-activities-visual-ux-redesign P4). This component is
 * strictly what comes AFTER the window: response chips, mirroring the
 * DFL-Labs Git-sandbox pattern where the command chips sit below the
 * terminal (P4d), and — for the rating step — the Duolingo "feedback near the
 * action" law (P3).
 */
export function SandboxControls({
  s,
  scenario,
  locale,
}: {
  s: ReturnType<typeof useSandboxScenario>;
  scenario: Scenario;
  locale: Locale;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="sandbox-controls">
      {s.mode === 'evaluate' && (
        <SandboxEvalPanel
          locale={locale}
          picked={s.lastEval?.rating}
          wrong={s.evalWrong}
          critique={s.critique}
          onRate={s.rate}
          onRetry={s.retry}
        />
      )}

      {s.mode === 'compose' && (
        <div className="flex flex-col gap-3">
          <SandboxSlotPanel
            scenario={scenario}
            model={s.model}
            locale={locale}
            visibleSlots={new Set(s.exposedSlotIds)}
            activeSlots={s.needs.slots}
            disabled={s.readOnly}
            onSet={s.onSet}
          />
          <SandboxChoiceChips
            scenario={scenario}
            model={s.model}
            locale={locale}
            visibleChoices={new Set(s.exposedChoiceIds)}
            disabled={s.readOnly}
            onChoose={s.onChoose}
          />
        </div>
      )}
    </div>
  );
}
