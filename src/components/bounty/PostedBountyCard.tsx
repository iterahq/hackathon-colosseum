import { PrizeTeraTag } from '@/components/bounty/PrizeTera';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExplorerAnchor, INPUT, LABEL, LINK, Notice, RequirementChip, Reward, StatusChip } from '@/components/bounty/bountyUi';
import { DirectChip } from '@/components/bounty/DirectParts';
import { FundingLink } from '@/components/bounty/FundingLink';
import { TxErrorNotice, TxPhaseNotice } from '@/components/bounty/TxStatus';
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SMALL, CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { useDeleteDraft, useRejectPosted, useWalletBountyTx } from '@/hooks/useBounties';
import { useI18n } from '@/i18n';
import { txUrl } from '@/lib/explorer';
import { describeTxError } from '@/services/bounty.service';
import { formatWhen, isDraft, lamportsToSol, plural, safeHttpsUrl } from '@/utils/bounty';
import type { PostedBounty, TxPhase } from '@/types/bounty';

function DeleteDraftAction({ bounty }: { bounty: PostedBounty }) {
  const { t } = useI18n();
  const remove = useDeleteDraft();
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={`${BTN_SECONDARY} ${BTN_SMALL} w-full sm:w-auto sm:self-start`} data-testid="bounty-mine-delete">
        {t('bounty.mine.delete')}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Notice>{t('bounty.mine.deleteConfirm')}</Notice>
      {remove.isError && <TxErrorNotice error={remove.error} />}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={remove.isPending} onClick={() => remove.mutate(bounty.id)} className={`${BTN_PRIMARY} ${BTN_SMALL}`} data-testid="bounty-mine-delete-confirm">
          {remove.isPending ? t('bounty.working') : t('bounty.mine.deleteYes')}
        </button>
        <button type="button" disabled={remove.isPending} onClick={() => setConfirming(false)} className={`${BTN_SECONDARY} ${BTN_SMALL}`}>
          {t('bounty.mine.cancel')}
        </button>
      </div>
    </div>
  );
}

function FundAction({ bounty }: { bounty: PostedBounty }) {
  const { t } = useI18n();
  const fund = useWalletBountyTx('fund');
  const [phase, setPhase] = useState<TxPhase | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <p className="[font:400_14px/1.5_Inter] text-[#A0978A]">{t('bounty.mine.awaiting')}</p>
      {fund.isPending && <TxPhaseNotice phase={phase} />}
      {fund.isError && <TxErrorNotice error={fund.error} />}
      {fund.isSuccess && <Notice tone="good" testId="bounty-mine-funded">{t('bounty.mine.fundedDone')}</Notice>}
      <button type="button" disabled={fund.isPending} onClick={() => fund.mutate({ bounty: bounty.id, onPhase: setPhase })} className={`${BTN_PRIMARY} ${BTN_SMALL} w-full sm:w-auto sm:self-start`} data-testid="bounty-mine-fund">
        {fund.isPending ? t('bounty.working') : t('bounty.mine.lock')}
      </button>
      {bounty.fundActionUrl && !fund.isSuccess && <FundingLink actionUrl={bounty.fundActionUrl} blinkUrl={bounty.fundBlinkUrl} audience="sponsor" />}
      <DeleteDraftAction bounty={bounty} />
    </div>
  );
}

function RefundAction({ bounty }: { bounty: PostedBounty }) {
  const { t } = useI18n();
  const refund = useWalletBountyTx('refund');
  const [phase, setPhase] = useState<TxPhase | null>(null);
  const [confirming, setConfirming] = useState(false);
  if (refund.isSuccess) return <Notice tone="good" testId="bounty-mine-refunded">{t('bounty.mine.refundedDone')}</Notice>;
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={`${BTN_SECONDARY} ${BTN_SMALL} w-full sm:w-auto sm:self-start`} data-testid="bounty-mine-refund">
        {t('bounty.mine.refund')}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Notice>{t('bounty.mine.refundConfirm')}</Notice>
      {refund.isPending && <TxPhaseNotice phase={phase} />}
      {refund.isError && <TxErrorNotice error={refund.error} />}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={refund.isPending} onClick={() => refund.mutate({ bounty: bounty.id, onPhase: setPhase })} className={`${BTN_PRIMARY} ${BTN_SMALL}`} data-testid="bounty-mine-refund-confirm">
          {refund.isPending ? t('bounty.working') : t('bounty.mine.refundYes')}
        </button>
        <button type="button" disabled={refund.isPending} onClick={() => setConfirming(false)} className={`${BTN_SECONDARY} ${BTN_SMALL}`}>
          {t('bounty.mine.cancel')}
        </button>
      </div>
    </div>
  );
}

function Review({ bounty }: { bounty: PostedBounty }) {
  const { t } = useI18n();
  const approve = useWalletBountyTx('approve');
  const reject = useRejectPosted();
  const [phase, setPhase] = useState<TxPhase | null>(null);
  const [note, setNote] = useState('');
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const sol = lamportsToSol(bounty.rewardLamports);
  const review = bounty.review;
  const learner = review?.wallet ?? bounty.claim?.wallet ?? null;
  const link = safeHttpsUrl(review?.submissionUrl ?? bounty.claim?.submissionUrl);
  const busy = approve.isPending || reject.isPending;
  const rejectError = reject.isError ? describeTxError(reject.error) : null;

  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-col gap-2 rounded-[10px] bg-[#0A0908] p-3">
        {learner && (
          <div className="flex flex-wrap items-center gap-2">
            <dt className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.mine.claimedBy')}</dt>
            <dd>
              <Link to={`/u/${learner}`} className="[font:500_12px_JetBrains_Mono] text-[#3FD17F] hover:underline" title={learner}>
                {bounty.claim?.walletShort ?? learner}
              </Link>
            </dd>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <dt className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.mine.delivery')}</dt>
          <dd className="min-w-0">
            {link ? (
              <a href={link} target="_blank" rel="noopener noreferrer" className="break-all [font:500_14px_Inter] text-[#3FD17F] underline" data-testid="bounty-mine-delivery">
                {link}
              </a>
            ) : (
              <span className="break-all [font:500_14px_Inter] text-[#E0655A]">{t('bounty.mine.noLink')}</span>
            )}
            {link && review?.linkCheck && review.linkCheck.verdict !== 'opens' && (
              <span className="mt-1 block [font:500_13px/1.45_Inter] text-[#E0A86F]" data-testid="bounty-mine-link-check" data-verdict={review.linkCheck.verdict}>
                {review.linkCheck.verdict === 'not_found'
                  ? t('bounty.mine.link.notFound', { status: review.linkCheck.status ?? 404 })
                  : review.linkCheck.status === null
                    ? t('bounty.mine.link.noAnswer')
                    : t('bounty.mine.link.unconfirmed', { status: review.linkCheck.status })}
              </span>
            )}
          </dd>
        </div>
        {review?.submissionNote && (
          <div className="flex flex-col gap-1">
            <dt className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.mine.note')}</dt>
            <dd className="whitespace-pre-line [font:400_14px/1.5_Inter] text-[#C9BFB0] [overflow-wrap:anywhere]">{review.submissionNote}</dd>
          </div>
        )}
        {review?.proofDays != null && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <dt className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.mine.proof')}</dt>
            <dd className="[font:500_12px_JetBrains_Mono] text-[#3FD17F]">{plural(t, 'bounty.mine.proofDays', review.proofDays)}</dd>
            {review.proofAsset && (
              <dd>
                <Link to={`/c/${review.proofAsset}`} className={LINK}>{t('bounty.mine.certificate')} →</Link>
              </dd>
            )}
          </div>
        )}
      </dl>
      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>{t('bounty.mine.approveNote')}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} className={INPUT} data-testid="bounty-mine-note" />
      </label>
      {approve.isPending && <TxPhaseNotice phase={phase} />}
      {approve.isError && <TxErrorNotice error={approve.error} />}
      {rejectError && <Notice tone="error">{t(rejectError.key, rejectError.vars)}</Notice>}
      {learner && <p className="[font:400_13px/1.5_Inter] text-[#A0978A]">{t('bounty.mine.approveHint', { wallet: bounty.claim?.walletShort ?? learner })}</p>}
      <div className="flex flex-wrap gap-2">
        {confirmingApprove || approve.isPending ? (
          <div className="flex w-full flex-col gap-2" data-testid="bounty-mine-approve-step">
            <Notice>{t('bounty.mine.approveConfirm', { sol, wallet: bounty.claim?.walletShort ?? learner ?? '' })}</Notice>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => approve.mutate({ bounty: bounty.id, note, onPhase: setPhase })} className={`${BTN_PRIMARY} ${BTN_SMALL}`} data-testid="bounty-mine-approve-confirm">
                {approve.isPending ? t('bounty.working') : t('bounty.mine.approveYes', { sol })}
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirmingApprove(false)} className={`${BTN_SECONDARY} ${BTN_SMALL}`} data-testid="bounty-mine-approve-cancel">
                {t('bounty.mine.approveCancel')}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={busy} onClick={() => setConfirmingApprove(true)} className={`${BTN_PRIMARY} ${BTN_SMALL}`} data-testid="bounty-mine-approve">
            {t('bounty.mine.approve')}
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => reject.mutate({ bounty: bounty.id, note })} className={`${BTN_SECONDARY} ${BTN_SMALL}`} data-testid="bounty-mine-reject">
          {reject.isPending ? t('bounty.working') : t('bounty.mine.reject')}
        </button>
      </div>
      <p className="[font:400_12px/1.4_Inter] text-[#A0978A]">{t('bounty.mine.rejectInfo')}</p>
      {reject.isSuccess && <Notice tone="good" testId="bounty-mine-rejected">{t('bounty.mine.rejected')}</Notice>}
    </div>
  );
}

function ByStatus({ bounty }: { bounty: PostedBounty }) {
  const { t, locale } = useI18n();
  const locked = Boolean(bounty.funding) && !bounty.refund && !bounty.payout;
  const winner = bounty.claim?.walletShort ?? bounty.payout?.wallet ?? '';
  switch (bounty.status) {
    case 'awaiting_funding':
      return <FundAction bounty={bounty} />;
    case 'open':
      return (
        <div className="flex flex-col gap-3">
          <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('bounty.mine.live')}</p>
          <RefundAction bounty={bounty} />
        </div>
      );
    case 'claimed':
      return (
        <p className="[font:500_14px/1.5_Inter] text-[#C9BFB0]" data-testid="bounty-mine-claimed">
          {t('bounty.mine.claimed', { wallet: bounty.claim?.walletShort ?? '', time: formatWhen(bounty.claim?.deadlineAt ?? null, locale) })}{' '}
          {bounty.claim && (
            <Link to={`/u/${bounty.claim.wallet}`} className="text-[#3FD17F] hover:underline">{t('bounty.mine.profile')} →</Link>
          )}
        </p>
      );
    case 'submitted':
      return <Review bounty={bounty} />;
    case 'paid':
      return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="[font:500_14px/1.5_Inter] text-[#C9BFB0]">{t('bounty.mine.paid', { wallet: winner })}</p>
          <ExplorerAnchor href={bounty.payout?.explorerUrl ?? (bounty.payout ? txUrl(bounty.payout.signature) : null)} label={t('bounty.mine.paidTx')} />
        </div>
      );
    case 'refunded':
      return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="[font:500_14px/1.5_Inter] text-[#C9BFB0]">{t('bounty.mine.refunded')}</p>
          <ExplorerAnchor href={bounty.refund?.explorerUrl ?? (bounty.refund ? txUrl(bounty.refund.signature) : null)} label={t('bounty.mine.refundTx')} />
        </div>
      );
    case 'expired':
      return (
        <div className="flex flex-col gap-3">
          <p className="[font:500_14px/1.5_Inter] text-[#C9BFB0]">{locked ? t('bounty.mine.expiredLocked') : t('bounty.mine.expired')}</p>
          {locked && <RefundAction bounty={bounty} />}
          {isDraft(bounty) && <DeleteDraftAction bounty={bounty} />}
        </div>
      );
    default:
      return <p className="[font:500_14px/1.5_Inter] text-[#A0978A]">{t('bounty.mine.moving')}</p>;
  }
}

export function PostedBountyCard({ bounty }: { bounty: PostedBounty }) {
  const { t } = useI18n();
  return (
    <li className={`${CARD} flex flex-col gap-3 p-4 sm:p-5`} data-testid="bounty-mine-item" data-status={bounty.status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to={`/bounties/${bounty.slug}`} className={`${MONO_LABEL} truncate text-[#3FD17F] hover:underline`}>
          /{bounty.slug}
        </Link>
        <span className="flex flex-wrap items-center gap-1.5">
          {bounty.direct && <DirectChip />}
          <StatusChip status={bounty.status} />
        </span>
      </div>
      <h3 className="[font:700_24px/1.1_'Barlow_Condensed'] text-[#F4EDE2] [overflow-wrap:anywhere]">{bounty.title}</h3>
      <div className="flex flex-wrap items-center gap-3">
        <Reward sol={bounty.rewardSol} />
        <PrizeTeraTag bounty={bounty} />
        <RequirementChip trail={bounty.requirement.trail} minDays={bounty.requirement.minDays} />
        <ExplorerAnchor href={bounty.escrow?.explorerUrl ?? null} label={t('bounty.escrow.address')} />
      </div>
      {bounty.direct && bounty.inviteeWallet && (
        <p className="[font:500_13px/1.45_Inter] text-[#C9BFB0] [overflow-wrap:anywhere]" data-testid="bounty-mine-invitee">
          {t('bounty.direct.sponsorLine', { wallet: bounty.inviteeWalletShort ?? bounty.inviteeWallet })}{' '}
          <Link to={`/u/${bounty.inviteeWallet}`} className="text-[#3FD17F] hover:underline">{t('bounty.mine.profile')} →</Link>
        </p>
      )}
      {bounty.hidden && (
        <Notice testId="bounty-mine-hidden">
          {t('bounty.mine.hidden', { reason: bounty.hiddenReason ?? t('bounty.mine.hiddenNoReason') })}
        </Notice>
      )}
      <ByStatus bounty={bounty} />
    </li>
  );
}
