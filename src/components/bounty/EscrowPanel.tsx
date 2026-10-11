import { Link } from 'react-router-dom';
import { CopyAddress, ExplorerAnchor, LINK, SECTION_TITLE, ShortWallet } from '@/components/bounty/bountyUi';
import { CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';
import { lamportsToSol } from '@/utils/bounty';
import type { Bounty } from '@/types/bounty';

const formatSol = (lamports: number): string => `${lamportsToSol(lamports)} SOL`;

export function EscrowPanel({ bounty }: { bounty: Bounty }) {
  const { t } = useI18n();
  const escrow = bounty.escrow;
  if (!escrow) return null;
  const program = escrow.custody === 'program';
  const sponsorWallet = bounty.postedBy.kind === 'wallet';
  const approverWallet = bounty.postedBy.wallet ?? escrow.refundAddress;
  return (
    <section className={`${CARD} flex flex-col gap-4 p-4 sm:p-5`} aria-labelledby="bounty-escrow" data-testid="bounty-escrow">
      <div className="flex flex-col gap-1">
        <h2 id="bounty-escrow" className={SECTION_TITLE}>{t('bounty.escrow.title')}</h2>
        <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t(program ? 'bounty.escrow.plain.program' : 'bounty.escrow.plain')}</p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
          <dt className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.escrow.address')}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <CopyAddress address={escrow.address} />
            <ExplorerAnchor href={escrow.explorerUrl} />
          </dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <dt className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.escrow.target')}</dt>
          <dd className="[font:700_20px_JetBrains_Mono] text-[#F4EDE2]">{formatSol(escrow.targetLamports)}</dd>
          <dd className="[font:400_12px/1.4_Inter] text-[#A0978A]">{t(program ? 'bounty.escrow.targetHint.program' : 'bounty.escrow.targetHint')}</dd>
        </div>
        {program && escrow.programId && (
          <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2" data-testid="bounty-escrow-program">
            <dt className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.escrow.program')}</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <CopyAddress address={escrow.programId} />
              <ExplorerAnchor href={escrow.programExplorerUrl} />
            </dd>
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2" data-testid="bounty-escrow-approver">
          <dt className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.escrow.approver')}</dt>
          {bounty.approver === 'sponsor_wallet' && approverWallet ? (
            <>
              <dd><CopyAddress address={approverWallet} /></dd>
              <dd className="[font:400_12px/1.4_Inter] text-[#A0978A]">{t('bounty.escrow.approver.wallet')}</dd>
            </>
          ) : (
            <dd className="[font:500_14px_Inter] text-[#C9BFB0]">{t('bounty.escrow.approver.itera')}</dd>
          )}
        </div>
        {escrow.refundAddress && (
          <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
            <dt className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.escrow.refund')}</dt>
            <dd><ShortWallet address={escrow.refundAddress} /></dd>
          </div>
        )}
      </dl>
      <p className="border-t border-[#262320] pt-3 [font:400_13px/1.5_Inter] text-[#A0978A]">{t(sponsorWallet ? 'bounty.custody.wallet' : program ? 'bounty.custody.program' : 'bounty.custody.server')}</p>
      {program && (
        <Link to="/verify#program" className={LINK} data-testid="bounty-verify-link">
          {t('verify.link')} →
        </Link>
      )}
    </section>
  );
}
