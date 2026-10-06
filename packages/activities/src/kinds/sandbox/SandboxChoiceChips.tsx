import { t, type ChatModel, type Locale, type Scenario } from '@iterahq/activity-spec/runtime';

/**
 * The scenario's context-tweak choices as chips (drive step-unlock
 * predicates). Same rounded-full pill pattern as `SandboxSeedChip`/
 * `SandboxSlotPanel`'s select options — the standard ITERA chip look, not an
 * ad-hoc card.
 */
export function SandboxChoiceChips({
  scenario,
  model,
  locale,
  visibleChoices,
  disabled,
  onChoose,
}: {
  scenario: Scenario;
  model: ChatModel;
  locale: Locale;
  visibleChoices: Set<string>;
  disabled: boolean;
  onChoose: (id: string) => void;
}) {
  const choices = (scenario.choices ?? []).filter((c) => visibleChoices.has(c.id));
  if (!choices.length) return null;
  return (
    <div className="flex flex-wrap gap-2" data-testid="sandbox-choices">
      {choices.map((c) => {
        const active = model.choicesMade.has(c.id);
        return (
          <button
            key={c.id}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(c.id)}
            className={`coarse:relative coarse:before:absolute coarse:before:-inset-y-1 coarse:before:inset-x-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
              active ? 'border-evergreen bg-evergreen text-obsidiana' : 'border-border bg-card text-foreground hover:border-evergreen/50'
            }`}
          >
            {t(c.label, locale)}
          </button>
        );
      })}
    </div>
  );
}
