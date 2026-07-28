import { useI18n } from '@/i18n';
import { LiveGuestBadge } from '@/components/live/LiveGuestBadge';

/**
 * The trailing badges on a roster row: the guest tag, a blinking dot for a
 * learner who dropped the call, the ✋ for a raised hand, and the "você" self
 * tag. Shared by every row of the live room list.
 */
export function LiveRosterBadges({
  userId,
  selfUserId,
  raised = false,
  down = false,
  guest = false,
}: {
  userId: string;
  selfUserId?: string;
  raised?: boolean;
  down?: boolean;
  /** Link-invited guest — ADR-9/ADR-11 make this badge non-optional. */
  guest?: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      {guest && <LiveGuestBadge />}
      {down && (
        <span
          data-testid="live-disconnected-badge"
          role="status"
          aria-label={t('live.rankedRoster.disconnected')}
          title={t('live.rankedRoster.disconnected')}
          className="flex-shrink-0 inline-block h-2 w-2 rounded-full bg-clay animate-pulse"
        />
      )}
      {raised && (
        <span data-testid="live-hand-badge" className="flex-shrink-0" aria-label={t('live.hand.raised')}>
          ✋
        </span>
      )}
      {userId === selfUserId && (
        <span className="text-[10px] uppercase tracking-wide text-clay font-mono flex-shrink-0">
          · {t('live.instructor.roster.you')}
        </span>
      )}
    </>
  );
}
