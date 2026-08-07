/**
 * The BOTTOM zone in `inputMode: "options"` — the palette the learner picks
 * from, rendered OUTWARD below the sandbox window, exactly where the chat
 * sandbox puts `SandboxChoiceChips`.
 *
 * Two granularities, authorable per step (question tsq2 → C):
 *
 *   • `command` — whole commands, one tap SENDS. Recognition. Distractors are
 *     just extra entries in the authored list, and the conformance test refuses
 *     a palette with only the right answer, because tap-the-only-option is not
 *     a question.
 *   • `token` — single tokens that append to the line; the learner assembles it
 *     and presses Run. Production, and the natural rung before free text. The
 *     palette is NOT consumed: a token can be tapped twice, which is what
 *     typing would let you do.
 *
 * Neither branch knows anything about correctness. The matcher runs afterwards,
 * on the assembled line, and it is the same code the free-text mode uses.
 */
export function TerminalOptionPalette({
  granularity,
  commands,
  tokens,
  disabled,
  onPickCommand,
  onPickToken,
  label,
}: {
  granularity: 'command' | 'token';
  commands: string[];
  tokens: string[];
  disabled: boolean;
  onPickCommand: (cmd: string) => void;
  onPickToken: (token: string) => void;
  label: string;
}) {
  const items = granularity === 'command' ? commands : tokens;
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2" data-testid="terminal-options">
      <div className="font-mono text-[11px] uppercase tracking-wider text-menta">{label}</div>
      <div
        className="flex flex-wrap gap-2"
        data-option-granularity={granularity}
        role="group"
        aria-label={label}
      >
        {items.map((item, i) => (
          <button
            key={`${item}-${i}`}
            type="button"
            disabled={disabled}
            data-testid={granularity === 'command' ? 'terminal-option-command' : 'terminal-option-token'}
            data-option={item}
            onClick={() => (granularity === 'command' ? onPickCommand(item) : onPickToken(item))}
            className={`rounded-full border font-mono transition-colors disabled:opacity-60 ${
              granularity === 'command'
                ? 'border-border bg-card px-4 py-2 text-sm text-foreground hover:border-evergreen/50'
                : 'border-border bg-card px-3 py-1.5 text-[13px] font-semibold text-foreground hover:border-evergreen/50'
            }`}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
