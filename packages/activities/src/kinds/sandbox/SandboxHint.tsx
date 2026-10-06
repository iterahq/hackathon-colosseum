import { useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { TeraAvatar } from '../../components/TeraAvatar.js';

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
        className="inline-flex items-center gap-1.5 text-sm font-medium coarse:relative coarse:before:absolute coarse:before:-inset-y-3 coarse:before:inset-x-0 text-menta transition-colors hover:text-evergreen-hi"
      >
        <Lightbulb className="h-3.5 w-3.5" /> {label}
      </button>
      {open && (
        <div
          className="mt-2 flex items-start gap-3 rounded-2xl border border-menta/25 bg-menta/5 p-3 text-sm leading-relaxed text-muted-foreground"
          data-testid="sandbox-hint"
        >
          <TeraAvatar mood="neutral" size="sm" className="-mt-1" />
          <p className="min-w-0 flex-1">{hint}</p>
        </div>
      )}
    </div>
  );
}
