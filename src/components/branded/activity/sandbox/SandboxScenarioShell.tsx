/**
 * Shared scaffold for the three sandbox activity types (IA / com opções /
 * completar). Owns the local `ChatModel` via `useSandboxScenario` and renders
 * the identical chat transcript + reveal + "Continuar" affordance; the ONLY
 * thing each type varies is its compose panel, selected by `variant` and
 * rendered inside `SandboxControls`. Runs entirely client-side over the shared
 * `@iterahq/activity-spec/runtime` — no `eval`, no network, no service-role.
 *
 * LAYOUT — the "Cloud Cowork" 3-zone law (plan
 * 20260717-iterahq-activities-visual-ux-redesign): instruction ABOVE the
 * sandbox (top zone) → an isolated OS-style window with the transcript AND the
 * composer INSIDE it, 100% width (middle zone) → the type's compose panel /
 * rating panel OUTWARD below the window (bottom zone). Step count is entirely
 * DATA-DRIVEN off `scenario.steps.length`.
 */
import { useEffect, useRef } from 'react';
import { MessageSquare } from 'lucide-react';
import { t, type Scenario } from '@iterahq/activity-spec/runtime';
import { useI18n } from '@/i18n';
import type { Activity } from '@/types/content';
import type { ActivityCompleteDetail } from '../activityFeedbackKinds';
import { ActivityShell } from '../parts';
import { SandboxChatLog } from './SandboxChatLog';
import { SandboxClearButton } from './SandboxClearButton';
import { SandboxControls, type SandboxVariant } from './SandboxControls';
import { SandboxHint } from './SandboxHint';
import { SandboxInputBar } from './SandboxInputBar';
import { SandboxReveal } from './SandboxReveal';
import { SandboxWindow } from './SandboxWindow';
import { useSandboxScenario } from './useSandboxScenario';
import { useAssistantStream } from './useAssistantStream';

export function SandboxScenarioShell({
  activity,
  onComplete,
  variant,
  reveal = false,
}: {
  activity: Activity;
  onComplete: (correct: boolean, detail?: ActivityCompleteDetail) => void;
  variant: SandboxVariant;
  /** Reveal the success state (timer stopped/expired) even without a submission. */
  reveal?: boolean;
}) {
  const { t: tr, locale } = useI18n();
  const scenario = activity.spec as unknown as Scenario;
  const isDone = activity.status === 'done';
  const s = useSandboxScenario(scenario, locale, reveal, isDone);
  const stream = useAssistantStream(s.model.messages);

  const showControls = !s.done && !stream.active;

  // The terminal verdict now surfaces in the SHELL's fixed FeedbackFooter (the
  // Duolingo pattern, PR #117 for the MCQ family — extended to the sandbox per
  // Tainan 2026-07-18), NOT an in-window "Continuar" button. When the sandbox
  // settles (the learner judged correctly → `won`, or the class force-revealed),
  // it emits its verdict UP exactly once; the shell holds on the activity and
  // slides the footer up, whose "Continuar" is what actually advances. The
  // deterministic terminal is always a success, so `correct` is true; the reveal
  // recap rides along as the footer explanation (and still shows in-window).
  const recap = t(scenario.reveal.recap, locale);
  const settled = s.won || reveal || isDone;
  const emittedRef = useRef(false);
  useEffect(() => {
    if (settled && !emittedRef.current) {
      emittedRef.current = true;
      onComplete(true, { explanation: recap });
    }
  }, [settled, recap, onComplete]);
  // Data-driven — reads `scenario.steps.length` directly; never hard-capped.
  const stepLabel = s.currentStep ? `${tr('activity.step')} ${s.stepIdx + 1}/${scenario.steps.length}` : undefined;
  const coachPrompt = s.currentStep ? t(s.currentStep.prompt, locale) : undefined;
  const coachHint = s.currentStep?.hint ? t(s.currentStep.hint, locale) : undefined;

  return (
    <ActivityShell kind="sandbox_scenario" icon={MessageSquare} label={tr('activity.sandboxScenario')}>
      <div className="flex flex-col gap-4">
        {/* TOP ZONE — instruction lives OUTSIDE/above the sandbox window, below
            the "SANDBOX" kind badge. The hint is a collapsed toggle here. */}
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
            composer live INSIDE it, the composer at 100% width. */}
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

        {/* BOTTOM ZONE — the type's compose panel (slots/chips) or the rating
            panel, right above the action. */}
        {showControls && (
          <SandboxControls s={s} scenario={scenario} locale={locale} variant={variant} />
        )}

        {/* Post-success reveal recap stays in-window (the celebratory card); the
            terminal "Continuar" moved to the shell's fixed FeedbackFooter. */}
        {s.done && <SandboxReveal scenario={scenario} locale={locale} lines={s.revealLines} />}
      </div>
    </ActivityShell>
  );
}
