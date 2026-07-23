import type { I18n, Locale, Scenario } from '@iterahq/activity-spec/runtime';
import { t } from '@iterahq/activity-spec/runtime';
import { SandboxSlotPanel } from './SandboxSlotPanel';
import { SandboxChoiceChips } from './SandboxChoiceChips';
import { SandboxSeedChip } from './SandboxSeedChip';
import { SandboxEvalPanel } from './SandboxEvalPanel';
import type { useSandboxScenario } from './useSandboxScenario';

/** The compose affordance each sandbox activity type offers the learner. */
export type SandboxVariant = 'ai' | 'options' | 'words';

/**
 * The BOTTOM zone — the type's compose panel (compose mode) or the rating panel
 * (evaluate mode), rendered OUTWARD/below the sandbox window. The composer and
 * instruction now live elsewhere — the composer INSIDE the window, the
 * instruction ABOVE it (see `SandboxScenarioShell`, plan
 * 20260717-iterahq-activities-visual-ux-redesign P4). `variant` picks the
 * compose panel: `words` fills slots, `options` picks choice chips, `ai`
 * composes free — nothing to fill in, so the scenario's fixed `basePrompt`
 * shows up as a seed chip here instead (never pre-filled into the composer).
 */
export function SandboxControls({
  s,
  scenario,
  locale,
  variant,
}: {
  s: ReturnType<typeof useSandboxScenario>;
  scenario: Scenario;
  locale: Locale;
  variant: SandboxVariant;
}) {
  const weakCritique: I18n = s.critique ?? { pt: 'Essa ficou fraca. Tenta outra opção.', en: 'That one came out weak. Try another option.' };

  return (
    <div className="flex flex-col gap-3" data-testid="sandbox-controls">
      {s.mode === 'compose' && s.composeWeak && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4" data-testid="sandbox-compose-weak">
          <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-destructive">
            {t({ pt: 'Ficou fraca. Repara:', en: 'Weak answer. Look:' }, locale)}
          </div>
          <p className="text-sm leading-relaxed text-foreground">{t(weakCritique, locale)}</p>
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

      {s.mode === 'compose' && s.needsSeedClick && (
        <SandboxSeedChip
          text={s.seedText ?? ''}
          active={s.seedInserted}
          disabled={s.readOnly}
          onToggle={s.onToggleSeed}
        />
      )}

      {s.mode === 'compose' && variant === 'words' && (
        <SandboxSlotPanel
          scenario={scenario}
          model={s.model}
          locale={locale}
          visibleSlots={new Set(s.exposedSlotIds)}
          activeSlots={s.needs.slots}
          disabled={s.readOnly}
          onSet={s.onSet}
        />
      )}

      {s.mode === 'compose' && variant === 'options' && (
        <SandboxChoiceChips
          scenario={scenario}
          model={s.model}
          locale={locale}
          visibleChoices={new Set(s.exposedChoiceIds)}
          disabled={s.readOnly}
          onChoose={s.onChoose}
        />
      )}
    </div>
  );
}
