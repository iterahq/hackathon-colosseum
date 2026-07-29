import { Check, Link2, Square, UserPlus } from 'lucide-react';
import { useI18n } from '@/i18n';

/**
 * The instructor's fixed footer: share the room, end the class. Pinned below the
 * scrolling room list so a full class can never push "encerrar aula" out of the
 * viewport.
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
    <div
      className={`shrink-0 border-t border-border ${compact ? 'p-3 flex items-center gap-2' : 'p-4 space-y-2'}`}
    >
      <button
        onClick={onCopyLink}
        data-testid="instructor-copy-link"
        className={`inline-flex items-center justify-center gap-2 h-10 rounded-full border border-border bg-background text-sm font-medium text-foreground hover:border-menta/50 transition-colors ${
          compact ? 'flex-1 min-w-0' : 'w-full'
        }`}
      >
        {copied ? (
          <>
            <Check className="w-4 h-4 text-menta shrink-0" />
            <span className="truncate">{t('live.instructor.copyLinkDone')}</span>
          </>
        ) : (
          <>
            <Link2 className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {compact ? t('live.instructor.copyLinkShort') : t('live.instructor.copyLink')}
            </span>
          </>
        )}
      </button>
      {/* Guest link (ADR-12) — for someone with NO account. Generates the
          session's short code on first use. No cap and no kick in v1
          (ADR-10/ADR-12): the control is social, and the code dies with the
          class. */}
      {onCopyGuestLink && (
        <button
          onClick={onCopyGuestLink}
          disabled={guestLinkBusy}
          data-testid="instructor-copy-guest-link"
          aria-label={
            compact
              ? guestCopied
                ? t('live.instructor.copyGuestLinkDone')
                : t('live.instructor.copyGuestLink')
              : undefined
          }
          className={`inline-flex items-center justify-center gap-2 rounded-full border border-clay/40 bg-clay/10 text-sm font-medium text-clay hover:bg-clay/20 transition-colors disabled:opacity-50 ${
            compact ? 'w-10 h-10 shrink-0' : 'w-full h-10'
          }`}
        >
          {guestCopied ? <Check className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          {!compact && (guestCopied ? t('live.instructor.copyGuestLinkDone') : t('live.instructor.copyGuestLink'))}
        </button>
      )}
      <button
        onClick={onEnd}
        disabled={busy}
        data-testid="instructor-end"
        aria-label={compact ? t('live.instructor.control.end') : undefined}
        className={`inline-flex items-center justify-center gap-1.5 rounded-full text-sm font-medium text-destructive/80 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 ${
          compact ? 'w-10 h-10 shrink-0 border border-destructive/30' : 'w-full h-9'
        }`}
      >
        <Square className="w-3.5 h-3.5" />
        {!compact && t('live.instructor.control.end')}
      </button>
    </div>
  );
}
