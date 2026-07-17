import { ArrowUp } from 'lucide-react';

/**
 * The composer input bar — a single rounded field that shows the prompt the
 * learner is assembling (or a placeholder) with a circular send button on the
 * right, the way a professional AI chat reads. The actual composing happens via
 * the slot/choice chips above; this bar is the "message being typed" + send.
 */
export function SandboxInputBar({
  text,
  placeholder,
  canSend,
  onSend,
  sendLabel,
}: {
  text: string;
  placeholder: string;
  canSend: boolean;
  onSend: () => void;
  sendLabel: string;
}) {
  return (
    <div className="flex items-end gap-2 rounded-3xl border border-border bg-obsidiana/60 p-2 pl-4">
      <p
        className={`flex-1 whitespace-pre-wrap py-2 text-[15px] leading-relaxed ${
          text.trim() ? 'text-foreground' : 'text-muted-foreground'
        }`}
        data-testid="sandbox-input-preview"
      >
        {text.trim() || placeholder}
      </p>
      <button
        type="button"
        disabled={!canSend}
        onClick={onSend}
        data-testid="sandbox-send"
        aria-label={sendLabel}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-evergreen text-obsidiana transition-colors hover:bg-evergreen-hi disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      >
        <ArrowUp className="h-5 w-5" />
      </button>
    </div>
  );
}
