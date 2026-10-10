import { CARD } from '@/components/shop/shopStyles';
import { useCompanion } from '@/hooks/useCompanion';
import { useReferralStatus } from '@/hooks/useGift';
import { GiftLifePanel } from './GiftLifePanel';
import { InviteCopy } from './InviteCard';

/** The gift block of a public profile; the owner of the profile also gets their invite link. */
export function ProfileGift({ wallet }: { wallet: string }) {
  const companion = useCompanion();
  const own = Boolean(companion.wallet) && companion.wallet === wallet;
  const referral = useReferralStatus({ enabled: own });
  return (
    <section className={`${CARD} flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5`} data-testid="profile-gift">
      <GiftLifePanel wallet={wallet} className="min-w-0 flex-1" />
      {own && referral.data && <InviteCopy status={referral.data} />}
    </section>
  );
}
