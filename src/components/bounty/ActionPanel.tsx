import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ExplorerAnchor, LoadError, Notice, SECTION_TITLE, Skeleton } from '@/components/bounty/bountyUi';
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SMALL, CARD } from '@/components/shop/shopStyles';
import { DeliverForm } from '@/components/bounty/DeliverForm';
import { LinkWalletButton } from '@/components/wallet/LinkWalletButton';
import { useCountdown } from '@/hooks/useCountdown';
import { useAcceptBounty, useBountySession, useMyBountyStatus, useWithdrawBounty } from '@/hooks/useBounties';
import { useI18n } from '@/i18n';
import { loginHref } from '@/lib/loginReturn';
import { bountyErrorCode } from '@/services/bounty.service';
import { formatRemaining } from '@/utils/bounty';
import type { BountyDetail, MyBountyStatus } from '@/types/bounty';

const ACCEPT_ERRORS = ['already_claiming', 'not_open', 'not_eligible', 'own_bounty'] as const;
const WITHDRAW_ERRORS = ['not_active'] as const;

/** What can go wrong in a step the learner's wallet signs, whatever the step. */
const SIGN_ERRORS = ['wallet_cancelled', 'no_wallet', 'wrong_wallet', 'wallet_failed', 'expired', 'refused_by_program', 'client_outdated', 'rate_limited', 'invalid_transaction', 'invalid_signature'] as const;

function errorText(t: (k: string) => string, scope: string, known: readonly string[], error: unknown): string {
  const code = bountyErrorCode(error);
  if (code && known.includes(code)) return t(`bounty.err.${scope}.${code}`);
  return code && (SIGN_ERRORS as readonly string[]).includes(code) ? t(`bounty.err.sign.${code}`) : t('bounty.err.generic');
}

function Panel({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'good' }) {
  const { t } = useI18n();
  return (
    <section className={`${CARD} flex flex-col gap-3 p-4 sm:p-5 ${tone === 'good' ? '!border-[#3FD17F]' : ''}`} aria-label={t('bounty.action.title')} data-testid="bounty-action">
      <h2 className={SECTION_TITLE}>{t('bounty.action.title')}</h2>
      {children}
    </section>
  );
}

function ActiveClaim({ bounty, status }: { bounty: BountyDetail; status: NonNullable<MyBountyStatus['claim']> }) {
  const { t } = useI18n();
  const withdraw = useWithdrawBounty();
  const [confirming, setConfirming] = useState(false);
  const deadline = status.deadlineAt ? Date.parse(status.deadlineAt) : null;
  const left = useCountdown(Number.isFinite(deadline) ? deadline : null);

  return (
    <>
      <p className="[font:500_14px/1.5_Inter] text-[#C9BFB0]" data-testid="bounty-countdown">
        {left > 0 ? t('bounty.active.left', { time: formatRemaining(left) }) : t('bounty.active.late')}
      </p>
      <DeliverForm bountyId={bounty.id} />
      <div className="flex flex-col gap-2 border-t border-[#262320] pt-3">
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className={`${BTN_SECONDARY} ${BTN_SMALL} w-full sm:w-auto sm:self-start`} data-testid="bounty-withdraw">
            {t('bounty.withdraw.cta')}
          </button>
        ) : (
          <>
            <Notice>
              {t('bounty.withdraw.confirm')}
              {bounty.escrow?.custody === 'program' && <span className="mt-1 block">{t('bounty.withdraw.signs')}</span>}
            </Notice>
            {withdraw.isError && <Notice tone="error">{errorText(t, 'withdraw', WITHDRAW_ERRORS, withdraw.error)}</Notice>}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={withdraw.isPending} onClick={() => withdraw.mutate(bounty.id)} className={`${BTN_PRIMARY} ${BTN_SMALL}`} data-testid="bounty-withdraw-confirm">
                {withdraw.isPending ? t('bounty.signing') : t('bounty.withdraw.yes')}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className={`${BTN_SECONDARY} ${BTN_SMALL}`}>
                {t('bounty.withdraw.no')}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Accept({ bounty, status }: { bounty: BountyDetail; status: MyBountyStatus }) {
  const { t } = useI18n();
  const accept = useAcceptBounty();
  return (
    <>
      {status.proof && (
        <p className="[font:500_14px/1.5_Inter] text-[#C9BFB0]" data-testid="bounty-proof">
          {t('bounty.accept.proof', { n: status.proof.daysDone })} <ExplorerAnchor href={status.proof.explorerUrl} label={t('bounty.accept.proofLink')} />
        </p>
      )}
      <p className="[font:400_14px/1.5_Inter] text-[#A0978A]">{t('bounty.accept.hint', { hours: bounty.claimHours })}</p>
      {bounty.escrow?.custody === 'program' && (
        <p className="[font:400_13px/1.5_Inter] text-[#A0978A]" data-testid="bounty-accept-signs">
          {t('bounty.accept.signs')}
        </p>
      )}
      {accept.isError && <Notice tone="error">{errorText(t, 'accept', ACCEPT_ERRORS, accept.error)}</Notice>}
      <button type="button" disabled={accept.isPending} onClick={() => accept.mutate(bounty.id)} className={`${BTN_PRIMARY} w-full sm:w-auto sm:self-start`} data-testid="bounty-accept">
        {accept.isPending ? t('bounty.signing') : t('bounty.accept.cta')}
      </button>
    </>
  );
}

function Missing({ bounty, status }: { bounty: BountyDetail; status: MyBountyStatus }) {
  const { t } = useI18n();
  const { trail, minDays, program } = bounty.requirement;
  if (status.reason === 'no_wallet') {
    return (
      <>
        <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('bounty.missing.noWallet')}</p>
        <LinkWalletButton className={`${BTN_PRIMARY} w-full sm:w-auto sm:self-start`} testId="bounty-link-wallet" />
      </>
    );
  }
  const done = status.proof?.daysDone ?? 0;
  return (
    <>
      <p className="[font:500_14px/1.5_Inter] text-[#C9BFB0]" data-testid="bounty-missing">
        {status.reason === 'not_enough_days' ? t('bounty.missing.days', { done, min: minDays, trail }) : t('bounty.missing.cert', { min: minDays, trail })}
      </p>
      <Link to={program ? `/program/${program}` : '/'} className={`${BTN_PRIMARY} w-full sm:w-auto sm:self-start`} data-testid="bounty-study">
        {t('bounty.missing.study')}
      </Link>
    </>
  );
}

export function BountyActionPanel({ bounty }: { bounty: BountyDetail }) {
  const { t } = useI18n();
  const { signedIn } = useBountySession();
  const mine = useMyBountyStatus(bounty.id);

  if (!signedIn) {
    if (bounty.status !== 'open') return null;
    return (
      <Panel>
        <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('bounty.signIn.hint')}</p>
        <Link to={loginHref(`/bounties/${bounty.slug}`)} className={`${BTN_PRIMARY} w-full sm:w-auto sm:self-start`} data-testid="bounty-sign-in">
          {t('bounty.signIn.cta')}
        </Link>
      </Panel>
    );
  }
  if (mine.isPending) {
    return (
      <Panel>
        <Skeleton className="h-12" />
      </Panel>
    );
  }
  if (mine.isError) {
    return (
      <Panel>
        <LoadError onRetry={() => void mine.refetch()} />
      </Panel>
    );
  }

  const status = mine.data;
  const claim = status.claim && status.claim.bountyId === bounty.id ? status.claim : null;
  const wonIt = bounty.status === 'paid' && Boolean(status.wallet) && bounty.claim?.wallet === status.wallet;

  if (wonIt || claim?.status === 'approved') {
    return (
      <Panel tone="good">
        <p className="[font:700_28px/1.1_'Barlow_Condensed'] text-[#3FD17F]">{t('bounty.won.title')}</p>
        <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('bounty.won.body', { sol: bounty.payout?.sol ?? bounty.rewardSol })}</p>
        <ExplorerAnchor href={bounty.payout?.explorerUrl ?? null} label={t('bounty.paid.tx')} />
      </Panel>
    );
  }
  if (claim?.status === 'active' && bounty.status === 'claimed') return <Panel><ActiveClaim bounty={bounty} status={claim} /></Panel>;
  if (claim?.status === 'submitted') {
    return (
      <Panel>
        <Notice tone="good">{t('bounty.submitted.body')}</Notice>
      </Panel>
    );
  }

  const rejected = claim?.status === 'rejected';
  const busy = status.busyElsewhere || (status.claim !== null && status.claim.bountyId !== bounty.id && (status.claim.status === 'active' || status.claim.status === 'submitted'));
  const open = bounty.status === 'open';
  if (!rejected && !open) return null;

  return (
    <Panel>
      {rejected && (
        <Notice tone="error" testId="bounty-rejected">
          <strong className="text-[#F4EDE2]">{t('bounty.rejected.title')}</strong>
          {claim?.reviewNote && <span className="mt-1 block whitespace-pre-line">{claim.reviewNote}</span>}
          {open && <span className="mt-1 block">{t('bounty.rejected.reopened')}</span>}
        </Notice>
      )}
      {open && busy && <Notice testId="bounty-busy">{t('bounty.busy')}</Notice>}
      {open && !busy && !status.eligible && <Missing bounty={bounty} status={status} />}
      {open && !busy && status.eligible && <Accept bounty={bounty} status={status} />}
    </Panel>
  );
}
