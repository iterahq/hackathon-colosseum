import { Send } from 'lucide-react';

/**
 * The composer input bar — a single rounded field, 100% width of its parent
 * (the sandbox window body), that shows the prompt the learner is assembling
 * (or a placeholder) with a circular SEND button on the right — the
 * conventional chat send affordance, not the old up-arrow (plan
 * 20260717-iterahq-activities-visual-ux-redesign, P4e). The actual composing
 * happens via the slot/choice chips OUTSIDE the window; this bar is the
 * "message being typed" + send, and now lives INSIDE the sandbox window.
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
    <div className="flex w-full items-end gap-2 rounded-3xl border border-white/10 bg-obsidiana p-2 pl-4 shadow-inner">
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
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full coarse:relative coarse:before:absolute coarse:before:-inset-0.5 bg-evergreen text-obsidiana transition-colors hover:bg-evergreen-hi disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      >
        <Send className="h-5 w-5" />
      </button>
    </div>
  );
}
