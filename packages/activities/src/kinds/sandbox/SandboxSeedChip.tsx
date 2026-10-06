/**
 * The scenario's fixed `basePrompt`, rendered as a clickable chip BELOW the
 * sandbox window — NEVER pre-filled into the composer (Tainan: "sempre o
 * usuário tem que inserir"). Clicking it inserts the text into the
 * (previously empty) composer; the learner then clicks Send. Two actions,
 * same as the choice-chip flow. Same rounded-full pill pattern already used
 * by `SandboxSlotPanel`'s select options — the standard ITERA chip look, not
 * an ad-hoc card.
 */
export function SandboxSeedChip({
  text,
  active,
  disabled,
  onToggle,
}: {
  text: string;
  active: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  if (!text) return null;
  return (
    <div className="flex flex-wrap gap-2" data-testid="sandbox-seed-row">
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        data-testid="sandbox-seed-chip"
        data-active={active ? 'true' : undefined}
        className={`coarse:relative coarse:before:absolute coarse:before:-inset-y-1 coarse:before:inset-x-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
          active ? 'border-evergreen bg-evergreen text-obsidiana' : 'border-border bg-card text-foreground hover:border-evergreen/50'
        }`}
      >
        {text}
      </button>
    </div>
  );
}
