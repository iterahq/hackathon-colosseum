import { CornerDownLeft } from 'lucide-react';

/**
 * The live prompt — INSIDE the sandbox window, 100% width (the middle zone of
 * the 3-zone law). Two jobs and no more: show the line being composed, and run
 * it.
 *
 * `editable: false` is the options mode. The learner is still looking at a real
 * command line being built up token by token — they just cannot type into it,
 * because narrowing the input space is the entire point of that mode.
 */
export function TerminalPromptBar({
  ps1,
  value,
  editable,
  placeholder,
  canRun,
  onChange,
  onRun,
  runLabel,
}: {
  ps1: string;
  value: string;
  editable: boolean;
  placeholder: string;
  canRun: boolean;
  onChange: (v: string) => void;
  onRun: () => void;
  runLabel: string;
}) {
  return (
    <div className="mt-3 flex w-full items-center gap-2 border-t border-border/60 pt-3">
      <span className="shrink-0 font-mono text-[13px] font-semibold text-evergreen">{ps1}</span>
      {editable ? (
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
          className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-foreground caret-evergreen outline-none placeholder:text-muted-foreground"
        />
      ) : (
        <p
          data-testid="terminal-draft"
          className={`min-w-0 flex-1 truncate font-mono text-[13px] ${
            value.trim() ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          {value.trim() || placeholder}
        </p>
      )}
      <button
        type="button"
        disabled={!canRun}
        onClick={onRun}
        data-testid="terminal-run"
        aria-label={runLabel}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-evergreen text-obsidiana transition-colors hover:bg-evergreen-hi disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      >
        <CornerDownLeft className="h-4 w-4" />
      </button>
    </div>
  );
}
