import { useActivityI18n } from '../../context.js';
import type { GuidedValues } from './types.js';

/** The characters a phone keyboard hides behind two taps, which every HTML blank needs. */
export const HARD_KEYS = ['<', '>', '/', '!', '='] as const;

/**
 * One tap per hard key, inserted into the text blank that has the focus. The chip takes no
 * focus itself (`onMouseDown` prevented), so the blank the learner was typing in keeps it;
 * with no blank focused the first empty text blank of the template is used.
 */
export function GuidedCodeKeys({ values, disabled, onSet }: { values: GuidedValues; disabled: boolean; onSet: (blankId: string, value: string) => void }) {
  const { t } = useActivityI18n();

  const insert = (key: string) => {
    const focused = document.activeElement as HTMLInputElement | null;
    let target = focused?.dataset.blankKind === 'text' ? focused : null;
    if (!target) {
      const inputs = [...document.querySelectorAll<HTMLInputElement>('input[data-blank-kind="text"]')];
      target = inputs.find((input) => !input.value) ?? inputs[0] ?? null;
      target?.focus();
    }
    const id = target?.dataset.blankId;
    if (!id) return;
    onSet(id, `${values[id] ?? ''}${key}`);
  };

  return (
    <div data-testid="guided-keys" className="mt-3">
      <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{t('code.guided.keysLabel')}</div>
      <div className="flex flex-wrap gap-2">
        {HARD_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            data-testid="guided-key"
            data-value={key}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insert(key)}
            className="min-h-11 min-w-11 rounded-full border border-border bg-card px-3.5 font-mono text-[15px] text-foreground transition-colors hover:border-evergreen/60 hover:text-evergreen-hi disabled:cursor-not-allowed disabled:opacity-50"
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}
