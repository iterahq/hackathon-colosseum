import { t, type ChatModel, type Locale, type Scenario } from '@iterahq/activity-spec/runtime';
import { ActivityTextarea } from '@/components/branded/activity/ActivityTextarea';

/** Renders a scenario's slots (select → chips, text → textarea) above the input. */
export function SandboxSlotPanel({
  scenario,
  model,
  locale,
  visibleSlots,
  activeSlots,
  disabled,
  onSet,
}: {
  scenario: Scenario;
  model: ChatModel;
  locale: Locale;
  visibleSlots: Set<string>;
  activeSlots: Set<string>;
  disabled: boolean;
  onSet: (slot: string, value: string) => void;
}) {
  const slots = (scenario.slots ?? []).filter((s) => visibleSlots.has(s.id));
  if (!slots.length) return null;
  return (
    <div className="flex flex-col gap-3" data-testid="sandbox-slots">
      {slots.map((slot) => {
        const value = model.slots[slot.id] ?? '';
        const active = activeSlots.has(slot.id);
        if (slot.kind === 'text' && !active && value.trim()) {
          return (
            <div key={slot.id} className="rounded-2xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{t(slot.label, locale)}:</span> {value.trim()}
            </div>
          );
        }
        const len = value.trim().length;
        const need = slot.minChars ?? 0;
        return (
          <div key={slot.id}>
            <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{t(slot.label, locale)}</div>
            {slot.kind === 'select' ? (
              <div className="flex flex-wrap gap-2">
                {(slot.options ?? []).map((opt) => {
                  const sel = value === opt;
                  const lbl = slot.optionLabels?.[opt];
                  return (
                    <button
                      key={opt}
                      type="button"
                      disabled={disabled}
                      onClick={() => onSet(slot.id, opt)}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                        sel ? 'border-evergreen bg-evergreen text-obsidiana' : 'border-border bg-card text-foreground hover:border-evergreen/50'
                      }`}
                    >
                      {lbl ? t(lbl, locale) : opt}
                    </button>
                  );
                })}
              </div>
            ) : (
              <>
                <ActivityTextarea
                  value={value}
                  disabled={disabled}
                  onChange={(next) => onSet(slot.id, next)}
                  placeholder={slot.placeholder ? t(slot.placeholder, locale) : ''}
                  rows={4}
                  className="resize-y"
                />
                {need > 0 && (
                  <div className={`mt-1.5 text-xs font-medium ${len >= need ? 'text-evergreen-hi' : 'text-muted-foreground'}`}>
                    {len >= need
                      ? t({ pt: '✓ pode enviar', en: '✓ ready to send' }, locale)
                      : `${len}/${need} — ${t({ pt: 'escreve mais um pouco', en: 'write a bit more' }, locale)}`}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
