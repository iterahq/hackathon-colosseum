import { Check, Link2, Square, UserPlus } from 'lucide-react';
import { TooltipProvider } from '@devfellowship/components';
import { LiveSidebarIconAction } from './LiveSidebarIconAction';
import { useI18n } from '@/i18n';

/**
 * The instructor's fixed footer: share the room, end the class. Pinned below the
 * scrolling room list so a full class can never push "encerrar aula" out of the
 * viewport.
 *
 * The two share actions are icon-only (label lives in the tooltip) so that
 * "encerrar a aula" — the one action the instructor hunts for under pressure —
 * takes the whole remaining width instead of competing with them.
 */
export function LiveSidebarActions({
  compact = false,
  copied = false,
  busy = false,
  onCopyLink,
  onCopyGuestLink,
  guestCopied = false,
  guestLinkBusy = false,
  onEnd,
}: {
  compact?: boolean;
  copied?: boolean;
  busy?: boolean;
  onCopyLink?: () => void;
  /** Undefined hides the guest button (the guest-link schema isn't applied). */
  onCopyGuestLink?: () => void;
  guestCopied?: boolean;
  guestLinkBusy?: boolean;
  onEnd?: () => void;
}) {
  const { t } = useI18n();

  return (
    // Nested provider: the app mounts one at the root, but this footer also
    // renders standalone in stories and tests, where Radix requires an ancestor.
    <TooltipProvider delayDuration={200}>
      <div
        className={`shrink-0 border-t border-border flex items-center gap-2 ${compact ? 'p-3' : 'p-4'}`}
      >
        <LiveSidebarIconAction
          label={copied ? t('live.instructor.copyLinkDone') : t('live.instructor.copyLink')}
          testId="instructor-copy-link"
          tone="neutral"
          onClick={onCopyLink}
        >
          {copied ? <Check className="w-4 h-4 text-menta" /> : <Link2 className="w-4 h-4" />}
        </LiveSidebarIconAction>

        {/* Guest link (ADR-12) — for someone with NO account. Generates the
            session's short code on first use. No cap and no kick in v1
            (ADR-10/ADR-12): the control is social, and the code dies with the
            class. */}
        {onCopyGuestLink && (
          <LiveSidebarIconAction
            label={
              guestCopied
                ? t('live.instructor.copyGuestLinkDone')
                : t('live.instructor.copyGuestLink')
            }
            testId="instructor-copy-guest-link"
            tone="clay"
            disabled={guestLinkBusy}
            onClick={onCopyGuestLink}
          >
            {guestCopied ? <Check className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          </LiveSidebarIconAction>
        )}

        <button
          type="button"
          onClick={onEnd}
          disabled={busy}
          data-testid="instructor-end"
          className="flex-1 min-w-0 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 text-sm font-semibold text-destructive hover:bg-destructive/20 hover:border-destructive/60 transition-colors disabled:opacity-50"
        >
          <Square className="w-4 h-4 shrink-0" />
          <span className="truncate">{t('live.instructor.control.endClass')}</span>
        </button>
      </div>
    </TooltipProvider>
  );
}
