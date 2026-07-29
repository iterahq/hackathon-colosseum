import { useState } from 'react';
import { Lightbulb } from 'lucide-react';

/**
 * The step hint — a collapsed "💡 ver dica" toggle in the TOP zone (instruction
 * block), matching the DFL-Labs Git-sandbox reference exactly (plan
 * 20260717-iterahq-activities-visual-ux-redesign, P4c). Previously rendered as
 * an always-open side rail, which also starved the input of width (P1) because
 * it reserved a fixed 15rem grid column even when empty.
 */
export function SandboxHint({ hint, label }: { hint: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="sandbox-hint-toggle"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-menta transition-colors hover:text-evergreen-hi"
      >
        <Lightbulb className="h-3.5 w-3.5" /> {label}
      </button>
      {open && (
        <p
          className="mt-2 rounded-2xl border border-menta/25 bg-menta/5 p-3 text-sm leading-relaxed text-muted-foreground"
          data-testid="sandbox-hint"
        >
          {hint}
        </p>
      )}
    </div>
  );
}
