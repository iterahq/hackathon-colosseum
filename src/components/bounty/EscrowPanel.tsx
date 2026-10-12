import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CopyAddress, ExplorerAnchor, Fold, LINK, SECTION_TITLE } from '@/components/bounty/bountyUi';
import { CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';
import { lamportsToSol } from '@/utils/bounty';
import { daysRuleText } from '@/utils/bountyJudge';
import type { Bounty } from '@/types/bounty';

const formatSol = (lamports: number): string => `${lamportsToSol(lamports)} SOL`;

function Tile({ label, children, wide = false, testId }: { label: string; children: ReactNode; wide?: boolean; testId?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 rounded-[12px] border border-[#262320] bg-[#0A0908] px-3 py-2.5 ${wide ? 'col-span-2' : ''}`} data-testid={testId}>
      <dt className="[font:600_10px/1.2_JetBrains_Mono] uppercase tracking-[.08em] text-[#A0978A]">{label}</dt>
      {children}
    </div>
  );
}

export function EscrowPanel({ bounty }: { bounty: Bounty }) {
  const { t } = useI18n();
  const escrow = bounty.escrow;
  if (!escrow) return null;
  const program = escrow.custody === 'program';
  const sponsorWallet = bounty.postedBy.kind === 'wallet';
  const approverWallet = bounty.postedBy.wallet ?? escrow.refundAddress;
  const walletApproves = bounty.approver === 'sponsor_wallet' && Boolean(approverWallet);
  return (
    <section className={`${CARD} flex flex-col gap-3 p-4 sm:p-5`} aria-labelledby="bounty-escrow" data-testid="bounty-escrow">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <span className="flex flex-wrap items-center gap-2">
          <h2 id="bounty-escrow" className={SECTION_TITLE}>{t('bounty.escrow.title')}</h2>
          <span className={`rounded-full border px-2.5 py-1 ${MONO_LABEL} ${program ? 'border-[#3FD17F]/50 text-[#3FD17F]' : 'border-[#2E2A25] text-[#A0978A]'}`} data-testid="bounty-escrow-custody" data-custody={escrow.custody}>
            {t(program ? 'bounty.escrow.chip.program' : 'bounty.escrow.chip.server')}
          </span>
        </span>
        {program && (
          <Link to="/verify#program" className={LINK} data-testid="bounty-verify-link">
            {t('verify.link')} →
          </Link>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile label={t('bounty.escrow.target')}>
          <dd className="[font:700_20px/1.2_'Barlow_Condensed'] text-[#3FD17F]" data-testid="bounty-escrow-target">{formatSol(escrow.targetLamports)}</dd>
        </Tile>
        <Tile label={t('bounty.escrow.approver')} testId="bounty-escrow-approver">
          {walletApproves && approverWallet ? (
            <dd><CopyAddress address={approverWallet} /></dd>
          ) : (
            <dd className="[font:600_12px/1.3_JetBrains_Mono] text-[#C9BFB0]">{t('bounty.escrow.approver.iteraShort')}</dd>
          )}
        </Tile>
        {escrow.refundAddress && (
          <Tile label={t('bounty.escrow.refundShort')} testId="bounty-escrow-refund">
            <dd><CopyAddress address={escrow.refundAddress} /></dd>
          </Tile>
        )}
        <Tile label={t('bounty.escrow.address')} wide testId="bounty-escrow-account">
          <dd className="flex flex-wrap items-center gap-x-2">
            <CopyAddress address={escrow.address} />
            <ExplorerAnchor href={escrow.explorerUrl} compact />
          </dd>
        </Tile>
        {program && escrow.programId && (
          <Tile label={t('bounty.escrow.program')} wide testId="bounty-escrow-program">
            <dd className="flex flex-wrap items-center gap-x-2">
              <CopyAddress address={escrow.programId} />
              <ExplorerAnchor href={escrow.programExplorerUrl} compact />
            </dd>
          </Tile>
        )}
      </dl>
      <Fold label={t('bounty.fold.how')} testId="bounty-escrow-how">
        <p>{t(program ? 'bounty.escrow.plain.program' : 'bounty.escrow.plain')}</p>
        <p>
          <strong className="text-[#C9BFB0]">{t('bounty.escrow.target')}:</strong> {t(program ? 'bounty.escrow.targetHint.program' : 'bounty.escrow.targetHint')}
        </p>
        <p>
          <strong className="text-[#C9BFB0]">{t('bounty.escrow.approver')}:</strong> {t(walletApproves ? 'bounty.escrow.approver.wallet' : 'bounty.escrow.approver.itera')}
        </p>
        {escrow.refundAddress && <p>{t('bounty.escrow.refund')} {escrow.refundAddress}</p>}
        <p>{t(sponsorWallet ? 'bounty.custody.wallet' : program ? 'bounty.custody.program' : 'bounty.custody.server')}</p>
        {program && (
          <p className="text-[#C9BFB0]" data-testid="bounty-days-rule" data-checked-by={escrow.daysCheckedBy}>
            {daysRuleText(t, escrow.daysCheckedBy, bounty.requirement.minDays)}
          </p>
        )}
      </Fold>
    </section>
  );
}
