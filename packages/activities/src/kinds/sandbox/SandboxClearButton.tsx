import { Eraser } from 'lucide-react';

/**
 * The "Limpar" (clear) affordance — pairs with the send button inside the
 * sandbox window, mirroring the DFL-Labs Git-sandbox RODAR + LIMPAR pattern
 * (plan 20260717-iterahq-activities-visual-ux-redesign, P4f). Clears only the
 * IN-PROGRESS composer state (current slot/choice selection or free-typed
 * text) — never the chat transcript, evaluations, or success state.
 */
export function SandboxClearButton({
  onClear,
  disabled,
  label,
}: {
  onClear: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      disabled={disabled}
      data-testid="sandbox-clear"
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
    >
      <Eraser className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
