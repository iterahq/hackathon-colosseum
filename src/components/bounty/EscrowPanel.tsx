import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CopyAddress, ExplorerAnchor, Fold, LINK, SECTION_TITLE } from '@/components/bounty/bountyUi';
import { CARD, FOCUS, MONO_LABEL } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';
import { lamportsToSol, safeHttpsUrl } from '@/utils/bounty';
import { daysRuleText } from '@/utils/bountyJudge';
import type { Bounty } from '@/types/bounty';

function OneLink({ href }: { href: string | null }) {
  const { t } = useI18n();
  const url = safeHttpsUrl(href);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" aria-label={t('bounty.explorer')} title={t('bounty.explorer')} className={`grid h-11 w-8 shrink-0 place-items-center rounded [font:700_15px_JetBrains_Mono] text-[#3FD17F] hover:text-[#5BE095] ${FOCUS}`} data-testid="bounty-escrow-link">
      ↗
    </a>
  );
}

const formatSol = (lamports: number): string => `${lamportsToSol(lamports)} SOL`;

function Tile({ label, children, testId, action }: { label: string; children: ReactNode; testId?: string; action?: ReactNode }) {
  return (
    <div className="relative flex min-w-0 flex-col gap-1 rounded-[12px] border border-[#262320] bg-[#0A0908] px-3 py-2.5" data-testid={testId}>
      <dt className={`[font:600_10px/1.2_JetBrains_Mono] uppercase tracking-[.08em] text-[#A0978A] ${action ? 'pr-8' : ''}`}>{label}</dt>
      {children}
      {action && <dd className="absolute right-0 top-0">{action}</dd>}
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
      </div>
      <dl className="grid grid-cols-2 gap-2 max-sm:[&>div:last-child:nth-child(odd)]:col-span-2 sm:grid-cols-3">
        <Tile label={t(bounty.status === 'paid' || bounty.status === 'refunded' ? 'bounty.escrow.amount' : 'bounty.escrow.target')}>
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
        <Tile label={t('bounty.escrow.address')} testId="bounty-escrow-account" action={<OneLink href={escrow.explorerUrl} />}>
          <dd><CopyAddress address={escrow.address} /></dd>
        </Tile>
        {program && escrow.programId && (
          <Tile label={t('bounty.escrow.program')} testId="bounty-escrow-program" action={<OneLink href={escrow.programExplorerUrl} />}>
            <dd><CopyAddress address={escrow.programId} /></dd>
          </Tile>
        )}
      </dl>
      <Fold
        label={t('bounty.fold.how')}
        testId="bounty-escrow-how"
        aside={
          program ? (
            <Link to="/verify#program" className={LINK} data-testid="bounty-verify-link">
              {t('verify.link')} →
            </Link>
          ) : undefined
        }
      >
        <p>{t(program ? 'bounty.escrow.plain.program' : 'bounty.escrow.plain')}</p>
        {bounty.status === 'paid' && <p data-testid="bounty-paid-plain">{t('bounty.paid.plain')}</p>}
        <p>
          <strong className="text-[#C9BFB0]">{t('bounty.escrow.target')}:</strong> {t(program ? 'bounty.escrow.targetHint.program' : 'bounty.escrow.targetHint')}
        </p>
        <p>
          <strong className="text-[#C9BFB0]">{t('bounty.escrow.approver')}:</strong> {t(walletApproves ? 'bounty.escrow.approver.wallet' : 'bounty.escrow.approver.itera')}
        </p>
        {escrow.refundAddress && <p>{t('bounty.escrow.refund')} {escrow.refundAddress}</p>}
        <p>{t(sponsorWallet ? 'bounty.custody.wallet' : program ? 'bounty.custody.program' : 'bounty.custody.server')}</p>
        <div className="flex flex-col gap-1" data-testid="bounty-escrow-explorers">
          <span className="flex flex-wrap items-center gap-x-2">
            <strong className="text-[#C9BFB0]">{t('bounty.escrow.address')}:</strong>
            <ExplorerAnchor href={escrow.explorerUrl} compact />
          </span>
          {program && escrow.programId && (
            <span className="flex flex-wrap items-center gap-x-2">
              <strong className="text-[#C9BFB0]">{t('bounty.escrow.program')}:</strong>
              <ExplorerAnchor href={escrow.programExplorerUrl} compact />
            </span>
          )}
        </div>
        {program && (
          <p className="text-[#C9BFB0]" data-testid="bounty-days-rule" data-checked-by={escrow.daysCheckedBy}>
            {daysRuleText(t, escrow.daysCheckedBy, bounty.requirement.minDays)}
          </p>
        )}
      </Fold>
    </section>
  );
}
