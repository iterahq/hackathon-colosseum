/**
 * SandboxScenario — the deterministic sandbox CHAT activity. The activity `spec`
 * IS a `Scenario`; this component runs it entirely client-side via the shared
 * `@iterahq/activity-spec/runtime` (the SAME runtime the labs POC and the
 * authoring Studio use — one runtime, zero drift). No `eval`, no network,
 * no service-role: the judge runs in the browser over a local `ChatModel`.
 *
 * Flow: the learner composes a prompt (slots/choices), sends it, then RATES the
 * answer (fraca / forte). A wrong rating is rejected with a
 * critique + retry; a correct one unlocks the next step. Answers never wear a
 * quality badge — judging them is the exercise. When `success` flips true an
 * explicit "Continuar" fires `onComplete(true)`. Honors `reveal` (live mode).
 *
 * LAYOUT — the "Cloud Cowork" 3-zone law (plan
 * 20260717-iterahq-activities-visual-ux-redesign): instruction ABOVE the
 * sandbox (top zone) → an isolated OS-style window with the transcript AND the
 * composer INSIDE it, 100% width (middle zone) → response-option chips /
 * rating panel OUTWARD below the window (bottom zone). Step count is entirely
 * DATA-DRIVEN off `scenario.steps.length` — this component never assumes or
 * caps a step count; whatever the instance's spec has is what renders.
 */
import { CheckCircle2, MessageSquare } from 'lucide-react';
import { t, type Scenario } from '@iterahq/activity-spec/runtime';
import { useI18n } from '@/i18n';
import type { Activity } from '@/types/content';
import { ActivityShell } from './parts';
import { SandboxChatLog } from './sandbox/SandboxChatLog';
import { SandboxClearButton } from './sandbox/SandboxClearButton';
import { SandboxControls } from './sandbox/SandboxControls';
import { SandboxHint } from './sandbox/SandboxHint';
import { SandboxInputBar } from './sandbox/SandboxInputBar';
import { SandboxReveal } from './sandbox/SandboxReveal';
import { SandboxWindow } from './sandbox/SandboxWindow';
import { useSandboxScenario } from './sandbox/useSandboxScenario';
import { useAssistantStream } from './sandbox/useAssistantStream';

export function SandboxScenarioActivity({
  activity,
  onComplete,
  reveal = false,
}: {
  activity: Activity;
  onComplete: (correct: boolean) => void;
  /** Reveal the success state (timer stopped/expired) even without a submission. */
  reveal?: boolean;
}) {
  const { t: tr, locale } = useI18n();
  const scenario = activity.spec as unknown as Scenario;
  const isDone = activity.status === 'done';
  const s = useSandboxScenario(scenario, locale, reveal, isDone);
  const stream = useAssistantStream(s.model.messages);

  const showContinue = s.won || reveal || isDone;
  const showControls = !s.done && !stream.active;
  // Data-driven — reads `scenario.steps.length` directly; never hard-capped.
  const stepLabel = s.currentStep ? `${tr('activity.step')} ${s.stepIdx + 1}/${scenario.steps.length}` : undefined;
  const coachPrompt = s.currentStep ? t(s.currentStep.prompt, locale) : undefined;
  const coachHint = s.currentStep?.hint ? t(s.currentStep.hint, locale) : undefined;

  return (
    <ActivityShell kind="sandbox_scenario" icon={MessageSquare} label={tr('activity.sandboxScenario')}>
      <div className="flex flex-col gap-4">
        {/* TOP ZONE — instruction lives OUTSIDE/above the sandbox window, below
            the "SANDBOX" kind badge (P4c). The hint is a collapsed toggle here
            (not a side rail) — the side rail used to reserve a fixed-width grid
            column that starved the composer of width even when empty (P1). */}
        {showControls && (stepLabel || coachPrompt) && (
          <div className="flex flex-col gap-2" data-testid="sandbox-instruction">
            {stepLabel && <div className="font-mono text-[11px] uppercase tracking-wider text-menta">{stepLabel}</div>}
            {coachPrompt && <p className="text-[15px] font-medium text-foreground">{coachPrompt}</p>}
            {coachHint && (
              <SandboxHint hint={coachHint} label={t({ pt: 'ver dica', en: 'see hint' }, locale)} />
            )}
          </div>
        )}

        {/* MIDDLE ZONE — the isolated "Cloud Cowork" window: transcript AND the
            composer live INSIDE it, the composer at 100% width (P1, P4a/b). */}
        <SandboxWindow>
          <div
            className="h-[34dvh] min-h-[220px] max-h-[400px] overflow-y-auto pr-1"
            data-testid="sandbox-scroll"
          >
            <SandboxChatLog
              messages={s.model.messages}
              streamIndex={stream.streamIndex}
              dots={stream.dots}
              revealed={stream.revealed}
            />
          </div>

          {showControls && s.mode === 'compose' && (
            <div className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3">
              <div className="flex justify-end">
                <SandboxClearButton
                  onClear={s.clear}
                  disabled={!s.canClear}
                  label={t({ pt: 'Limpar', en: 'Clear' }, locale)}
                />
              </div>
              <SandboxInputBar
                text={s.inputText}
                placeholder={t({ pt: 'escreva seu pedido…', en: 'type your ask…' }, locale)}
                canSend={s.canSend}
                onSend={s.send}
                sendLabel={t({ pt: 'Enviar', en: 'Send' }, locale)}
              />
            </div>
          )}
        </SandboxWindow>

        {/* BOTTOM ZONE — response-option chips (outward, P4d) or the rating
            panel, right above the action (P2/P3). */}
        {showControls && <SandboxControls s={s} scenario={scenario} locale={locale} />}

        {s.done && <SandboxReveal scenario={scenario} locale={locale} lines={s.revealLines} />}

        {showContinue && (
          <button
            type="button"
            onClick={() => onComplete(true)}
            data-testid="sandbox-continue"
            data-locked={isDone ? 'true' : undefined}
            className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-full font-medium transition-colors ${
              isDone
                ? 'cursor-default border border-menta/40 bg-menta/15 text-menta'
                : 'bg-evergreen text-obsidiana hover:bg-evergreen-hi'
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            {isDone ? tr('activity.done') : tr('activity.continue')}
          </button>
        )}
      </div>
    </ActivityShell>
  );
}
