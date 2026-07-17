import { Lightbulb } from 'lucide-react';
import { t, type Locale, type Scenario } from '@iterahq/activity-spec/runtime';
import { SandboxInputBar } from './SandboxInputBar';
import { SandboxSlotPanel } from './SandboxSlotPanel';
import { SandboxChoiceChips } from './SandboxChoiceChips';
import { SandboxEvalPanel } from './SandboxEvalPanel';
import type { useSandboxScenario } from './useSandboxScenario';

/**
 * Everything that is NOT the message exchange: the step header, the compose
 * panels (slots/choices/composer) or the rating panel, and the coach hint. Lives
 * OUTSIDE the chat so the transcript reads like a real conversation. Hint sits in
 * a side column on wide screens, below on narrow.
 */
export function SandboxControls({
  s,
  scenario,
  locale,
  stepLabel,
  coachPrompt,
  coachHint,
}: {
  s: ReturnType<typeof useSandboxScenario>;
  scenario: Scenario;
  locale: Locale;
  stepLabel?: string;
  coachPrompt?: string;
  coachHint?: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="flex flex-col gap-3" data-testid="sandbox-controls">
        {(stepLabel || coachPrompt) && (
          <div>
            {stepLabel && (
              <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-menta">{stepLabel}</div>
            )}
            {coachPrompt && <p className="text-[15px] font-medium text-foreground">{coachPrompt}</p>}
          </div>
        )}

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
            <SandboxInputBar
              text={s.inputText}
              placeholder={t({ pt: 'escreva seu pedido…', en: 'type your ask…' }, locale)}
              canSend={s.canSend}
              onSend={s.send}
              sendLabel={t({ pt: 'Enviar', en: 'Send' }, locale)}
            />
          </div>
        )}
      </div>

      {coachHint && (
        <aside
          className="flex h-fit items-start gap-2 rounded-2xl border border-menta/25 bg-menta/5 p-4 text-sm leading-relaxed text-muted-foreground"
          data-testid="sandbox-hint"
        >
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-menta" />
          <span>{coachHint}</span>
        </aside>
      )}
    </div>
  );
}
