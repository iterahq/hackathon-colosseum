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
import { useEffect, useRef } from 'react';
import { CheckCircle2, MessageSquare, Play } from 'lucide-react';
import { t, type Scenario } from '@iterahq/activity-spec/runtime';
import { useI18n } from '@/i18n';
import type { Activity } from '@/types/content';
import { ActivityShell } from './parts';
import { SandboxBubble } from './sandbox/SandboxBubble';
import { SandboxSlotPanel } from './sandbox/SandboxSlotPanel';
import { SandboxChoiceChips } from './sandbox/SandboxChoiceChips';
import { SandboxEvalPanel } from './sandbox/SandboxEvalPanel';
import { SandboxReveal } from './sandbox/SandboxReveal';
import { useSandboxScenario } from './sandbox/useSandboxScenario';

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

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [s.model.messages.length, s.done]);

  return (
    <ActivityShell kind="sandbox_scenario" icon={MessageSquare} label={tr('activity.sandboxScenario')}>
      {s.currentStep && !s.done && (
        <div className="mb-4 rounded-2xl border border-border bg-obsidiana/60 p-4" data-testid="sandbox-instruction">
          <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-menta">
            {tr('activity.step')} {s.stepIdx + 1}/{scenario.steps.length}
          </div>
          <p className="font-display text-lg leading-relaxed text-foreground">{t(s.currentStep.prompt, locale)}</p>
          {s.currentStep.hint && <p className="mt-1.5 text-sm text-muted-foreground">{t(s.currentStep.hint, locale)}</p>}
        </div>
      )}

      <div className="flex min-h-[10rem] flex-col gap-2.5 rounded-2xl border border-border bg-card p-4" data-testid="sandbox-chat">
        {s.model.messages.map((m, i) => (
          <SandboxBubble key={i} role={m.role} text={m.text} />
        ))}
        <div ref={endRef} />
      </div>

      {!s.done && s.mode === 'evaluate' && (
        <div className="mt-4">
          <SandboxEvalPanel
            locale={locale}
            picked={s.lastEval?.rating}
            wrong={s.evalWrong}
            critique={s.critique}
            onRate={s.rate}
            onRetry={s.retry}
          />
        </div>
      )}

      {!s.done && s.mode === 'compose' && (
        <div className="mt-4 flex flex-col gap-4">
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

          {s.inputText.trim() && (
            <div className="rounded-2xl border border-border bg-obsidiana/40 px-4 py-3 text-sm text-foreground" data-testid="sandbox-input-preview">
              <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {t({ pt: 'seu prompt', en: 'your prompt' }, locale)}
              </div>
              <p className="whitespace-pre-wrap leading-relaxed">{s.inputText}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!s.canSend}
              onClick={s.send}
              data-testid="sandbox-send"
              className="inline-flex items-center gap-2 rounded-full bg-evergreen px-5 py-2.5 font-medium text-obsidiana transition-colors hover:bg-evergreen-hi disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play className="h-4 w-4" /> {t({ pt: 'Enviar', en: 'Send' }, locale)}
            </button>
          </div>
        </div>
      )}

      {s.done && <SandboxReveal scenario={scenario} locale={locale} lines={s.revealLines} />}

      <button
        type="button"
        disabled={!s.won && !reveal}
        onClick={() => onComplete(true)}
        data-testid="sandbox-continue"
        data-locked={isDone ? 'true' : undefined}
        className={`mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full font-medium transition-colors ${
          isDone
            ? 'cursor-default border border-menta/40 bg-menta/15 text-menta'
            : 'bg-evergreen text-obsidiana hover:bg-evergreen-hi disabled:cursor-not-allowed disabled:opacity-40'
        }`}
      >
        <CheckCircle2 className="h-4 w-4" />
        {isDone ? tr('activity.done') : tr('activity.continue')}
      </button>
    </ActivityShell>
  );
}
