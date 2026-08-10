import { useActivityI18n } from '../../context.js';

/**
 * The shared word bank for `bank` blanks — every candidate on screen at once,
 * which is what makes this the easiest of the three variants: the learner is
 * choosing where a word goes, not remembering that it exists.
 *
 * A spent chip is DIMMED, not removed. Removing it would reflow the whole bank
 * on every placement, and the learner loses the map they had just built of
 * where each word sits.
 *
 * Spending is COUNTED, not a set membership: the same word can be the answer to
 * two holes, and each of those holes needs a chip of its own.
 *
 * With every hole already full there is nowhere for a chip to land, so the whole
 * bank goes inert. A live-looking chip that silently did nothing was the worst of
 * the three options — the learner would read it as "the app ignored me".
 */
export function GuidedCodeBank({
  words,
  spent,
  disabled,
  onPick,
}: {
  words: string[];
  /** How many chips of each word are already placed. */
  spent: Record<string, number>;
  disabled: boolean;
  onPick: (word: string) => void;
}) {
  const { t } = useActivityI18n();
  if (!words.length) return null;
  const seen: Record<string, number> = {};

  return (
    <div data-testid="guided-bank" className="mt-3">
      <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {t('code.guided.bankLabel')}
      </div>
      <div className="flex flex-wrap gap-2">
        {words.map((word, i) => {
          // The i-th chip of a word is spent while at least i+1 holes hold it.
          seen[word] = (seen[word] ?? 0) + 1;
          const isSpent = seen[word] <= (spent[word] ?? 0);
          return (
            <button
              key={`${word}-${i}`}
              type="button"
              data-testid="guided-bank-chip"
              data-value={word}
              data-spent={isSpent ? 'true' : 'false'}
              disabled={disabled || isSpent}
              onClick={() => onPick(word)}
              className={`rounded-full border px-3.5 py-1.5 font-mono text-[13px] transition-colors disabled:cursor-not-allowed ${
                isSpent
                  ? 'border-border bg-muted/40 text-muted-foreground/50 line-through'
                  : 'border-border bg-card text-foreground hover:border-evergreen/60 hover:text-evergreen-hi'
              }`}
            >
              {word}
            </button>
          );
        })}
      </div>
    </div>
  );
}
