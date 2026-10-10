import { CopyButton } from '@/components/passport/CopyButton';
import { CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { useReferralStatus } from '@/hooks/useGift';
import { useI18n } from '@/i18n';
import type { ReferralStatus } from '@/types/gift';
import { inviteLink } from '@/utils/gift';

/** "Copy invite": the learner's own invite link, built on the origin the app is served from. */
export function InviteCopy({ status }: { status: ReferralStatus }) {
  const { t } = useI18n();
  return <CopyButton value={inviteLink(window.location.origin, status.code)} label={t('invite.copy')} doneLabel={t('passport.copied')} display={t('invite.copy')} />;
}

/** The invite card of the shop: the rule in one line, the link and how many friends came. Hidden until the status answers. */
export function InviteCard({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const { data: status } = useReferralStatus();
  if (!status) return null;
  const rewarded = status.rewardedCount === 1 ? t('invite.count.rewardedOne') : t('invite.count.rewarded', { n: status.rewardedCount });
  const nobody = status.rewardedCount === 0 && status.pendingCount === 0;

  return (
    <section id="invite" className={`${CARD} flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-l-4 border-l-[#3FD17F] p-5`} aria-labelledby="invite-title" data-testid="invite-card">
      <div className="min-w-0 flex-1 basis-[280px]">
        <h2 id="invite-title" className={compact ? "[font:700_24px/1_'Barlow_Condensed']" : "[font:700_32px/1_'Barlow_Condensed']"}>
          {t('invite.title')}
        </h2>
        <p className="mt-2 max-w-[560px] [font:400_15px/1.5_Inter] text-[#C9BFB0]">{t('invite.rule')}</p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <InviteCopy status={status} />
        <p className={`${MONO_LABEL} flex flex-wrap gap-x-3 gap-y-1 text-[#A0978A]`} data-testid="invite-count" data-rewarded={status.rewardedCount} data-pending={status.pendingCount}>
          {nobody ? (
            <span>{t('invite.count.none')}</span>
          ) : (
            <>
              <span className="text-[#3FD17F]">{rewarded}</span>
              {status.pendingCount > 0 && <span>{t('invite.count.pending', { n: status.pendingCount })}</span>}
            </>
          )}
        </p>
      </div>
    </section>
  );
}
