import { useOpenInviteCount } from '@/hooks/useInvites';
import { useI18n } from '@/i18n';

/** A count on the Bounties tab while a direct bounty waits for the signed-in wallet. Nothing is drawn for zero. */
export function InviteBadge({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const count = useOpenInviteCount();
  if (count === 0) return null;
  return (
    <span
      className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F2C66D] px-1 [font:700_10px_JetBrains_Mono] text-[#0A0908] ${className}`}
      role="img"
      aria-label={t('bounty.inbox.badge', { n: count })}
      data-testid="invite-badge"
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}
