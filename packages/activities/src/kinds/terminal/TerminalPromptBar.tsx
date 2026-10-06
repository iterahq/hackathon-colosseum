import { CornerDownLeft, X } from 'lucide-react';
import { promptSigil } from './ps1.js';

/**
 * The live prompt — INSIDE the sandbox window, 100% width (the middle zone of
 * the 3-zone law). Two jobs and no more: show the line being composed, and run
 * it.
 *
 * `editable: false` is the options mode. The learner is still looking at a real
 * command line being built up token by token — they just cannot type into it,
 * because narrowing the input space is the entire point of that mode.
 *
 * `pills` is the token surface (plan §5): the composed line is NOT text there,
 * it is the chips the learner moved up out of the palette, each still clickable
 * to send it back down. Rendering it as a string would make the return trip
 * invisible — and the return trip is half of the interaction.
 *
 * `showRun: false` is the whole-command options mode, where ONE TAP SENDS (plan
 * `20260807-itera-terminal-sandbox-refinamentos` §4). Rendering a disabled Run
 * button there is not harmless: a control that never does anything still says
 * "a second action is expected", and the learner waits for a step that does not
 * exist. See `TerminalSubmitMode` for the three surfaces.
 *
 * `shrink-0` is load-bearing, not tidiness: this bar is the LAST child of the
 * window body's flex column and the transcript above it is `flex-1`, so the
 * bottom rail only stays put while this bar refuses to be squeezed. Without it
 * a long session shrinks the composer instead of scrolling the transcript.
 *
 * ── BELOW `sm`, THE PREFIX COLLAPSES TO ITS SIGIL (Tainan, TG 2026-08-10) ───
 * *"no mobile não aparece o input completo, talvez no mobile mostrar só $ para
 * aparecer o restante do input"*. The prefix is `shrink-0` — which is correct,
 * a prompt that shrinks is a prompt that lies — so on a phone it took the
 * width from the only element that can give it: the learner's own line. His
 * screenshot showed the typed command clipped to two characters.
 *
 * BOTH forms are rendered and CSS picks one. Not `matchMedia`, not a resize
 * listener: the choice is made by the same cascade that lays the bar out, in
 * the same frame, so there is no first paint at the wrong width and no state
 * to keep in sync. The cost is one hidden node; `display: none` keeps it out of
 * the a11y tree too, so a screen reader hears exactly one prefix.
 *
 * ⚠️ `data-ps1` carries the FULL authored prompt on the wrapper regardless of
 * which form is painted. Assertions and anything reading the composed line get
 * the authored value at every width — the shortening never reaches data. See
 * `ps1.ts` for why the short form is a sigil rather than the trailing path.
 */
export function TerminalPromptBar({
  ps1,
  value,
  editable,
  pills,
  onRemovePill,
  showRun,
  submitMode,
  placeholder,
  canRun,
  onChange,
  onRun,
  runLabel,
  removeLabel,
}: {
  ps1: string;
  value: string;
  editable: boolean;
  /**
   * The composed line as MOVABLE chips. `null` = this surface composes text.
   * Identified by authored index, so a palette offering `git` twice yields two
   * chips that come and go independently.
   */
  pills: ReadonlyArray<{ index: number; token: string }> | null;
  onRemovePill: (index: number) => void;
  /** Whether this surface needs an explicit send affordance at all. */
  showRun: boolean;
  /** Exposed for tests and for styling hooks — the derivation lives in the shell. */
  submitMode: string;
  placeholder: string;
  canRun: boolean;
  onChange: (v: string) => void;
  onRun: () => void;
  runLabel: string;
  /** What clicking a pill does — the accessible half of the return trip. */
  removeLabel: string;
}) {
  return (
    <div
      className="mt-3 flex w-full shrink-0 items-center gap-2 border-t border-border/60 pt-3"
      data-testid="terminal-prompt-bar"
      data-submit-mode={submitMode}
    >
      <span
        className="shrink-0 font-mono text-[13px] font-semibold text-evergreen"
        data-testid="terminal-ps1"
        data-ps1={ps1}
      >
        <span data-testid="terminal-ps1-short" title={ps1} className="sm:hidden">
          {promptSigil(ps1)}
        </span>
        <span data-testid="terminal-ps1-full" className="hidden sm:inline">
          {ps1}
        </span>
      </span>
      {pills ? (
        <div
          data-testid="terminal-draft"
          /* The line as a STRING, for assertions and for anything that needs to
             read what would run. The visible form is the chips themselves. */
          data-draft={value}
          data-pill-count={pills.length}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"
        >
          {pills.length === 0 && (
            <span className="truncate font-mono text-[13px] text-muted-foreground">
              {placeholder}
            </span>
          )}
          {pills.map(({ index, token }) => (
            <button
              key={index}
              type="button"
              onClick={() => onRemovePill(index)}
              data-testid="terminal-pill"
              data-option={token}
              data-option-index={index}
              /* The accessible name has to say what the click DOES. "git" alone
                 would read as a second way to add it. */
              aria-label={`${token} — ${removeLabel}`}
              title={removeLabel}
              className="inline-flex items-center gap-1 rounded-full border border-evergreen/60 bg-evergreen/10 px-2.5 py-1 font-mono text-[13px] font-semibold text-foreground transition-colors hover:border-evergreen hover:bg-evergreen/20"
            >
              {token}
              <X className="h-3 w-3 opacity-70" />
            </button>
          ))}
        </div>
      ) : editable ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canRun) onRun();
          }}
          placeholder={placeholder}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          data-testid="terminal-input"
          aria-label={placeholder}
          className="min-w-0 flex-1 bg-transparent font-mono text-[13px] coarse:text-base text-foreground caret-evergreen outline-none placeholder:text-muted-foreground"
        />
      ) : (
        <p
          data-testid="terminal-draft"
          className={`min-w-0 flex-1 truncate max-sm:whitespace-normal max-sm:break-words max-sm:leading-tight font-mono text-[13px] ${
            value.trim() ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          {value.trim() || placeholder}
        </p>
      )}
      {showRun && (
        <button
          type="button"
          disabled={!canRun}
          onClick={onRun}
          data-testid="terminal-run"
          aria-label={runLabel}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full coarse:relative coarse:before:absolute coarse:before:-inset-1 bg-evergreen text-obsidiana transition-colors hover:bg-evergreen-hi disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
          <CornerDownLeft className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
