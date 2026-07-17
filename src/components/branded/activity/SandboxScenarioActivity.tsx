/**
 * SandboxScenario — the deterministic sandbox CHAT activity. The activity `spec`
 * IS a `Scenario`; this component runs it entirely client-side via the shared
 * `@iterahq/activity-spec/runtime` (the SAME runtime the labs POC and the
 * authoring Studio use — one runtime, zero drift). No `eval`, no network,
 * no service-role: the judge runs in the browser over a local `ChatModel`.
 *
 * Flow: the learner composes a prompt (slots/choices), sends it, then RATES the
 * answer (fraca / mais ou menos / forte). A wrong rating is rejected with a
 * critique + retry; a correct one unlocks the next step. Answers never wear a
 * quality badge — judging them is the exercise. When `success` flips true an
 * explicit "Continuar" fires `onComplete(true)`. Honors `reveal` (live mode).
 */
import { CheckCircle2, MessageSquare } from 'lucide-react';
import { t, type Scenario } from '@iterahq/activity-spec/runtime';
import { useI18n } from '@/i18n';
import type { Activity } from '@/types/content';
import { ActivityShell } from './parts';
import { SandboxChatLog } from './sandbox/SandboxChatLog';
import { SandboxControls } from './sandbox/SandboxControls';
import { SandboxReveal } from './sandbox/SandboxReveal';
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
  const stepLabel = s.currentStep ? `${tr('activity.step')} ${s.stepIdx + 1}/${scenario.steps.length}` : undefined;
  const coachPrompt = s.currentStep ? t(s.currentStep.prompt, locale) : undefined;
  const coachHint = s.currentStep?.hint ? t(s.currentStep.hint, locale) : undefined;

  return (
    <ActivityShell kind="sandbox_scenario" icon={MessageSquare} label={tr('activity.sandboxScenario')}>
      <div className="flex flex-col gap-4">
        {/* The chat is STRICTLY the message exchange — steps, prompts, choices,
            ratings, hints and the reveal all live OUTSIDE it, below/beside. The
            transcript scrolls INSIDE this small card so it never grows the page. */}
        <div className="rounded-2xl border border-border bg-obsidiana/40 p-4">
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
        </div>

        {showControls && (
          <SandboxControls
            s={s}
            scenario={scenario}
            locale={locale}
            stepLabel={stepLabel}
            coachPrompt={coachPrompt}
            coachHint={coachHint}
          />
        )}

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
