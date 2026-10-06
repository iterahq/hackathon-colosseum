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
 *   • `token` — chips the learner MOVES UP into the prompt; they assemble the
 *     line and press Run. Production, and the natural rung before free text.
 *
 *     ⚠️ The palette IS consumed, since 2026-08-07 (plan
 *     `20260807-itera-terminal-sandbox-refinamentos` §5, Tainan's own words:
 *     the two trays are "dois lados do mesmo conjunto"). It used to be
 *     reusable — a token could be tapped twice — on the reasoning that typing
 *     lets you repeat a word. That reasoning treated the palette as a keyboard;
 *     the interaction Tainan asked for is a TRANSFER, where a chip is in exactly
 *     one of the two trays and the sum is invariant. A chip that stays put after
 *     being "moved" contradicts the affordance it now has.
 *
 *     A step that genuinely needs the same token twice authors it twice: chips
 *     are identified by INDEX, so two `git` entries are two independent chips.
 *     (The package's own schema comment still says "not consumed" — it describes
 *     the pre-2026-08-07 player and is stale until the package is republished.)
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
  emptyLabel,
}: {
  granularity: 'command' | 'token';
  commands: string[];
  /** Only the chips still DOWN here — the ones already moved up are gone. */
  tokens: ReadonlyArray<{ index: number; token: string }>;
  disabled: boolean;
  onPickCommand: (cmd: string) => void;
  /** Moves the chip UP by its authored index (NOT by its text — duplicates). */
  onPickToken: (index: number) => void;
  label: string;
  /** Shown when every chip has been moved up: the tray is empty, not missing. */
  emptyLabel: string;
}) {
  if (granularity === 'command') {
    if (commands.length === 0) return null;
    return (
      <div className="flex flex-col gap-2" data-testid="terminal-options">
        <div className="font-mono text-[11px] uppercase tracking-wider text-menta">{label}</div>
        <div
          className="flex flex-wrap gap-2"
          data-option-granularity="command"
          role="group"
          aria-label={label}
        >
          {commands.map((item, i) => (
            <button
              key={`${item}-${i}`}
              type="button"
              disabled={disabled}
              data-testid="terminal-option-command"
              data-option={item}
              onClick={() => onPickCommand(item)}
              className="coarse:relative coarse:before:absolute coarse:before:-inset-y-1 coarse:before:inset-x-0 rounded-full border border-border bg-card px-4 py-2 font-mono text-sm text-foreground transition-colors hover:border-evergreen/50 disabled:opacity-60"
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="terminal-options">
      <div className="font-mono text-[11px] uppercase tracking-wider text-menta">{label}</div>
      <div
        className="flex min-h-[2.25rem] flex-wrap items-center gap-2"
        data-option-granularity="token"
        data-token-count={tokens.length}
        role="group"
        aria-label={label}
      >
        {tokens.length === 0 && (
          <span data-testid="terminal-options-empty" className="text-xs text-muted-foreground">
            {emptyLabel}
          </span>
        )}
        {tokens.map(({ index, token }) => (
          <button
            key={index}
            type="button"
            disabled={disabled}
            data-testid="terminal-option-token"
            data-option={token}
            data-option-index={index}
            onClick={() => onPickToken(index)}
            className="coarse:relative coarse:before:absolute coarse:before:-inset-y-1.5 coarse:before:-inset-x-0.5 rounded-full border border-border bg-card px-3 py-1.5 font-mono text-[13px] font-semibold text-foreground transition-colors hover:border-evergreen/50 disabled:opacity-60"
          >
            {token}
          </button>
        ))}
      </div>
    </div>
  );
}
