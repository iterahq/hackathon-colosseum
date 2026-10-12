import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ExplorerAnchor, LoadError, Notice, SECTION_TITLE, Skeleton } from '@/components/bounty/bountyUi';
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SMALL, CARD } from '@/components/shop/shopStyles';
import { DeliverForm } from '@/components/bounty/DeliverForm';
import { FundingLink } from '@/components/bounty/FundingLink';
import { JudgeDeliverForm, JudgeProgress } from '@/components/bounty/JudgeParts';
import { TeraLoader } from '@/components/tera/TeraLoader';
import { LinkWalletButton } from '@/components/wallet/LinkWalletButton';
import { useCountdown } from '@/hooks/useCountdown';
import { useBountySession, useJudgeSubmit, useMyBountyStatus, useSignedBountyStep } from '@/hooks/useBounties';
import { useI18n } from '@/i18n';
import { loginHref } from '@/lib/loginReturn';
import { bountyErrorCode, type StepPhase } from '@/services/bounty.service';
import { actionTitle, isSponsor } from '@/utils/bountyAction';
import { formatRemaining, plural } from '@/utils/bounty';
import type { BountyDetail, MyBountyStatus } from '@/types/bounty';

const ACCEPT_ERRORS = ['already_claiming', 'not_open', 'not_eligible', 'own_bounty', 'judged_before', 'not_invited'] as const;
const WITHDRAW_ERRORS = ['not_active'] as const;

/** What can go wrong in a step the learner's wallet signs, whatever the step. */
const SIGN_ERRORS = ['wallet_cancelled', 'no_wallet', 'wrong_wallet', 'wallet_failed', 'expired', 'refused_by_program', 'client_outdated', 'rate_limited', 'invalid_transaction', 'invalid_signature'] as const;

function errorText(t: (k: string) => string, scope: string, known: readonly string[], error: unknown): string {
  const code = bountyErrorCode(error);
  if (code && known.includes(code)) return t(`bounty.err.${scope}.${code}`);
  return code && (SIGN_ERRORS as readonly string[]).includes(code) ? t(`bounty.err.sign.${code}`) : t('bounty.err.generic');
}

type Step = ReturnType<typeof useSignedBountyStep>;

const stepLabel = (t: (k: string) => string, phase: StepPhase | null) => t(phase === 'wallet' || phase === null ? 'bounty.step.wallet' : 'bounty.step.confirming');

function StepProgress({ kind, step }: { kind: 'accept' | 'withdraw'; step: Step }) {
  const { t } = useI18n();
  if (step.pending) {
    return (
      <Notice testId={`bounty-${kind}-progress`}>
        <span className="block">{stepLabel(t, step.phase)}</span>
        {step.explorerUrl && <ExplorerAnchor href={step.explorerUrl} label={t('bounty.step.tx')} />}
      </Notice>
    );
  }
  if (!step.outcome) return null;
  return (
    <Notice tone="good" testId={`bounty-${kind}-done`}>
      <span className="block">{t(step.outcome === 'settled' ? `bounty.step.done.${kind}` : 'bounty.step.stale')}</span>
      {step.explorerUrl && <ExplorerAnchor href={step.explorerUrl} label={t('bounty.step.tx')} />}
    </Notice>
  );
}

function Panel({ children, title, tone = 'plain' }: { children: ReactNode; title: string; tone?: 'plain' | 'good' }) {
  return (
    <section className={`${CARD} flex flex-col gap-3 p-4 sm:p-5 ${tone === 'good' ? '!border-[#3FD17F]' : ''}`} aria-label={title} data-testid="bounty-action">
      <h2 className={SECTION_TITLE} data-testid="bounty-action-title">{title}</h2>
      {children}
    </section>
  );
}

function ActiveClaim({ bounty, status, withdraw, judge }: { bounty: BountyDetail; status: NonNullable<MyBountyStatus['claim']>; withdraw: Step; judge: ReturnType<typeof useJudgeSubmit> }) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const deadline = status.deadlineAt ? Date.parse(status.deadlineAt) : null;
  const left = useCountdown(Number.isFinite(deadline) ? deadline : null);

  return (
    <>
      <p className="[font:500_14px/1.5_Inter] text-[#C9BFB0]" data-testid="bounty-countdown">
        {left > 0 ? t('bounty.active.left', { time: formatRemaining(left) }) : t('bounty.active.late')}
      </p>
      {bounty.judge ? <JudgeDeliverForm bounty={bounty} judge={judge} /> : <DeliverForm bountyId={bounty.id} />}
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
            {withdraw.error !== null && !withdraw.pending && <Notice tone="error">{errorText(t, 'withdraw', WITHDRAW_ERRORS, withdraw.error)}</Notice>}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={withdraw.pending} onClick={() => withdraw.run(bounty.id)} className={`${BTN_PRIMARY} ${BTN_SMALL}`} data-testid="bounty-withdraw-confirm">
                {withdraw.pending ? stepLabel(t, withdraw.phase) : t('bounty.withdraw.yes')}
              </button>
              <button type="button" disabled={withdraw.pending} onClick={() => setConfirming(false)} className={`${BTN_SECONDARY} ${BTN_SMALL}`}>
                {t('bounty.withdraw.no')}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Accept({ bounty, status, accept }: { bounty: BountyDetail; status: MyBountyStatus; accept: Step }) {
  const { t } = useI18n();
  return (
    <>
      {status.proof && (
        <div className="[font:500_14px/1.5_Inter] text-[#C9BFB0]" data-testid="bounty-proof">
          {t('bounty.accept.proof', { n: status.proof.daysDone })} <ExplorerAnchor href={status.proof.explorerUrl} label={t('bounty.accept.proofLink')} />
        </div>
      )}
      <p className="[font:400_14px/1.5_Inter] text-[#A0978A]">{t('bounty.accept.hint', { hours: bounty.claimHours })}</p>
      {bounty.escrow?.custody === 'program' && (
        <p className="[font:400_13px/1.5_Inter] text-[#A0978A]" data-testid="bounty-accept-signs">
          {t('bounty.accept.signs')}
        </p>
      )}
      {accept.error !== null && !accept.pending && <Notice tone="error">{errorText(t, 'accept', ACCEPT_ERRORS, accept.error)}</Notice>}
      <button type="button" disabled={accept.pending} onClick={() => accept.run(bounty.id)} className={`${BTN_PRIMARY} w-full sm:w-auto sm:self-start`} data-testid="bounty-accept">
        {accept.pending ? stepLabel(t, accept.phase) : t('bounty.accept.cta')}
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
  const accept = useSignedBountyStep('accept');
  const withdraw = useSignedBountyStep('withdraw');
  const judge = useJudgeSubmit();
  return (
    <>
      {bounty.status !== 'paid' && <StepProgress kind="accept" step={accept} />}
      <StepProgress kind="withdraw" step={withdraw} />
      <JudgeProgress judge={judge} paid={bounty.status === 'paid'} />
      <PanelView bounty={bounty} accept={accept} withdraw={withdraw} judge={judge} />
    </>
  );
}

function PanelView({ bounty, accept, withdraw, judge }: { bounty: BountyDetail; accept: Step; withdraw: Step; judge: ReturnType<typeof useJudgeSubmit> }) {
  const { t } = useI18n();
  const { signedIn } = useBountySession();
  const mine = useMyBountyStatus(bounty.id);
  const heading = actionTitle(bounty, signedIn && mine.isSuccess ? mine.data : null);
  const title = heading.count === undefined ? t(heading.key, heading.vars) : plural(t, heading.key, heading.count, heading.vars);

  const waiting = bounty.status === 'awaiting_funding' && bounty.fundActionUrl !== null && bounty.postedBy.kind === 'wallet';
  const fundingPanel = (
    <Panel title={t('bounty.waiting.title')}>
      <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]" data-testid="bounty-waiting">{t('bounty.waiting.body')}</p>
      {bounty.fundActionUrl && <FundingLink actionUrl={bounty.fundActionUrl} blinkUrl={bounty.fundBlinkUrl} audience="visitor" sponsorShort={bounty.postedBy.walletShort ?? bounty.postedBy.name} />}
    </Panel>
  );

  if (!signedIn) {
    if (waiting) return fundingPanel;
    if (bounty.status !== 'open') return null;
    return (
      <Panel title={title}>
        <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]" data-testid="bounty-signin-hint">
          {bounty.direct && bounty.inviteeWallet ? t('bounty.direct.signInHint', { wallet: bounty.inviteeWalletShort ?? bounty.inviteeWallet }) : t('bounty.signIn.hint')}
        </p>
        <Link to={loginHref(`/bounties/${bounty.slug}`)} className={`${BTN_PRIMARY} w-full sm:w-auto sm:self-start`} data-testid="bounty-sign-in">
          {t('bounty.signIn.cta')}
        </Link>
      </Panel>
    );
  }
  const settled = bounty.status === 'paid' || bounty.status === 'refunded' || bounty.status === 'expired';
  if (settled && !mine.isSuccess) return null;
  if (mine.isPending) {
    return (
      <Panel title={title}>
        <TeraLoader size="sm" label={t('bounty.action.reading')} data-testid="bounty-action-reading" />
      </Panel>
    );
  }
  if (mine.isError) {
    return (
      <Panel title={title}>
        <LoadError onRetry={() => void mine.refetch()} />
      </Panel>
    );
  }

  const status = mine.data;
  if (isSponsor(bounty, status)) {
    return (
      <Panel title={title}>
        <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]" data-testid="bounty-sponsor">{t(bounty.status === 'open' ? 'bounty.sponsor.open' : 'bounty.sponsor.body')}</p>
        {waiting && bounty.fundActionUrl && <FundingLink actionUrl={bounty.fundActionUrl} blinkUrl={bounty.fundBlinkUrl} audience="sponsor" />}
        <Link to="/bounties/mine" className={`${BTN_PRIMARY} w-full sm:w-auto sm:self-start`} data-testid="bounty-sponsor-manage">
          {t('bounty.sponsor.manage')}
        </Link>
      </Panel>
    );
  }
  if (waiting) return fundingPanel;
  if (status.notInvited) {
    if (bounty.status !== 'open') return null;
    return (
      <Panel title={title}>
        <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]" data-testid="bounty-not-invited">
          {t('bounty.notInvited.body', { wallet: bounty.inviteeWalletShort ?? status.inviteeWallet ?? '' })}
        </p>
        <Link to="/bounties" className={`${BTN_PRIMARY} w-full sm:w-auto sm:self-start`} data-testid="bounty-not-invited-board">
          {t('bounty.notInvited.board')}
        </Link>
      </Panel>
    );
  }
  const claim = status.claim && status.claim.bountyId === bounty.id ? status.claim : null;
  const wonIt = bounty.status === 'paid' && Boolean(status.wallet) && bounty.claim?.wallet === status.wallet;

  if (wonIt || claim?.status === 'approved') {
    return (
      <Panel title={title} tone="good">
        <p className="[font:700_28px/1.1_'Barlow_Condensed'] text-[#3FD17F]">{t('bounty.won.title')}</p>
        <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('bounty.won.body', { sol: bounty.payout?.sol ?? bounty.rewardSol })}</p>
        <ExplorerAnchor href={bounty.payout?.explorerUrl ?? null} label={t('bounty.paid.tx')} />
      </Panel>
    );
  }
  if (claim?.status === 'active' && bounty.status === 'claimed') return <Panel title={title}><ActiveClaim bounty={bounty} status={claim} withdraw={withdraw} judge={judge} /></Panel>;
  if (claim?.status === 'submitted') {
    return (
      <Panel title={title}>
        <Notice tone="good">{t(bounty.judge ? 'bounty.judge.confirming' : 'bounty.submitted.body')}</Notice>
      </Panel>
    );
  }

  const rejected = claim?.status === 'rejected';
  const busy = status.busyElsewhere || (status.claim !== null && status.claim.bountyId !== bounty.id && (status.claim.status === 'active' || status.claim.status === 'submitted'));
  const open = bounty.status === 'open';
  if (!rejected && !open) return null;

  return (
    <Panel title={title}>
      {bounty.direct && bounty.inviteeWallet === status.wallet && <Notice tone="good" testId="bounty-direct-foryou">{t('bounty.direct.forYou')}</Notice>}
      {rejected && (
        <Notice tone="error" testId="bounty-rejected">
          <strong className="text-[#F4EDE2]">{t('bounty.rejected.title')}</strong>
          {claim?.reviewNote && <span className="mt-1 block whitespace-pre-line">{claim.reviewNote}</span>}
          {open && <span className="mt-1 block">{t('bounty.rejected.reopened')}</span>}
        </Notice>
      )}
      {open && status.judgedBefore && bounty.judge && <Notice testId="bounty-judged-before">{t('bounty.judge.judgedBefore')}</Notice>}
      {open && busy && <Notice testId="bounty-busy">{t('bounty.busy')}</Notice>}
      {open && !busy && !(status.judgedBefore && bounty.judge) && !status.eligible && <Missing bounty={bounty} status={status} />}
      {open && !busy && !(status.judgedBefore && bounty.judge) && status.eligible && <Accept bounty={bounty} status={status} accept={accept} />}
    </Panel>
  );
}
