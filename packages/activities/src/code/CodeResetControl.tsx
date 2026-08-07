import { useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { useActivityI18n } from '../context.js';

/**
 * "Recomeçar do código inicial" — the escape hatch for a learner who broke the
 * starter beyond repair and would otherwise sit out the rest of the class
 * (Tainan, áudio 2026-07-23: "acho que pode ter um reset. Sim, reset").
 *
 * NOT the same thing as "Tentar de novo" in the feedback screen: that one goes
 * back to editing WITH the work intact. This one throws the work away, so it
 * asks first — a destructive action one accidental tap away from a learner's
 * whole exercise is a worse bug than the one we are fixing.
 *
 * The confirmation is inline instead of `window.confirm` on purpose: a native
 * dialog is blockable, unstyled, and untranslated, and the app also runs
 * embedded. Two calm steps in the page beat a system pop-up for a teenager who
 * is already frustrated.
 *
 * Lives with the activity, not the lesson shell — the control belongs to the
 * exercise (Tainan, same audio).
 */
export function CodeResetControl({
  onReset,
  disabled = false,
  className = '',
}: {
  /** Discard the work and put the authored starter back. */
  onReset: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useActivityI18n();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div
        className={`flex flex-col gap-2 rounded-2xl border border-border bg-muted/30 p-3 sm:flex-row sm:items-center ${className}`}
        role="group"
        aria-live="polite"
        data-testid="code-reset-prompt"
      >
        <p className="text-sm text-foreground">{t('code.reset.confirmPrompt')}</p>
        <div className="flex gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              onReset();
            }}
            data-testid="code-reset-confirm"
            className="inline-flex h-9 items-center justify-center rounded-full bg-evergreen px-4 text-sm font-medium text-obsidiana transition-colors hover:bg-evergreen-hi"
          >
            {t('code.reset.confirm')}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            data-testid="code-reset-cancel"
            className="inline-flex h-9 items-center justify-center rounded-full border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('code.reset.cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      disabled={disabled}
      data-testid="code-reset"
      className={`inline-flex items-center gap-2 self-start rounded-full border border-border bg-muted/40 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-menta/50 hover:text-menta disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      <RefreshCcw className="h-4 w-4" />
      {t('code.reset.action')}
    </button>
  );
}
