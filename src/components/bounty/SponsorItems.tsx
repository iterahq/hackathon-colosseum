import { PrizeTeraTag } from '@/components/bounty/PrizeTera';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExplorerAnchor, INPUT, LABEL, Notice, ShortWallet, StatusChip, RequirementChip, Reward } from '@/components/bounty/bountyUi';
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SMALL, CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { useApproveBounty, useFundBounty, useRefreshBounty, useRefundBounty, useRejectBounty } from '@/hooks/useBounties';
import { useI18n } from '@/i18n';
import { bountyErrorCode } from '@/services/bounty.service';
import { plural, REFUNDABLE, safeHttpsUrl } from '@/utils/bounty';
import type { ApproveResult, SponsorBounty } from '@/types/bounty';

const SPONSOR_ERRORS = ['forbidden', 'not_submitted', 'self_review', 'treasury_not_allowed', 'not_fundable', 'not_refundable', 'bounty_not_found'];

function useErrorText() {
  const { t } = useI18n();
  return (error: unknown) => {
    const code = bountyErrorCode(error);
    return code && SPONSOR_ERRORS.includes(code) ? t(`bounty.err.sponsor.${code}`) : t('bounty.err.generic');
  };
}

function Head({ bounty }: { bounty: SponsorBounty }) {
  const { locale } = useI18n();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to={`/bounties/${bounty.slug}`} className={`${MONO_LABEL} truncate text-[#3FD17F] hover:underline`}>
          /{bounty.slug}
        </Link>
        <StatusChip status={bounty.status} />
      </div>
      <h3 className="[font:700_24px/1.1_'Barlow_Condensed'] text-[#F4EDE2] [overflow-wrap:anywhere]">{bounty.titleI18n[locale] || bounty.title}</h3>
      <div className="flex flex-wrap items-center gap-3">
        <Reward sol={bounty.rewardSol} />
        <PrizeTeraTag bounty={bounty} />
        <RequirementChip trail={bounty.requirement.trail} minDays={bounty.requirement.minDays} />
      </div>
    </>
  );
}

export function RefundButton({ bounty }: { bounty: SponsorBounty }) {
  const { t } = useI18n();
  const refund = useRefundBounty();
  const errorText = useErrorText();
  const [confirming, setConfirming] = useState(false);
  if (!REFUNDABLE.includes(bounty.status)) return null;
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={`${BTN_SECONDARY} ${BTN_SMALL} w-full sm:w-auto`} data-testid="bounty-refund">
        {t('bounty.sponsor.refund')}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Notice>{t('bounty.sponsor.refundConfirm', { wallet: bounty.escrow?.refundAddress ?? '—' })}</Notice>
      {refund.isError && <Notice tone="error">{errorText(refund.error)}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={refund.isPending} onClick={() => refund.mutate(bounty.id)} className={`${BTN_PRIMARY} ${BTN_SMALL}`} data-testid="bounty-refund-confirm">
          {refund.isPending ? t('bounty.working') : t('bounty.sponsor.refundYes')}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className={`${BTN_SECONDARY} ${BTN_SMALL}`}>
          {t('bounty.withdraw.no')}
        </button>
      </div>
    </div>
  );
}

export function ReviewItem({ bounty }: { bounty: SponsorBounty }) {
  const { t } = useI18n();
  const approve = useApproveBounty();
  const reject = useRejectBounty();
  const errorText = useErrorText();
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const review = bounty.review;
  const link = safeHttpsUrl(review?.submissionUrl);
  const result: ApproveResult | undefined = approve.data;
  const busy = approve.isPending || reject.isPending;

  return (
    <li className={`${CARD} flex flex-col gap-3 p-4`} data-testid="bounty-review-item">
      <Head bounty={bounty} />
      <dl className="flex flex-col gap-2 rounded-[10px] bg-[#0A0908] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <dt className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.sponsor.learner')}</dt>
          <dd>{review?.wallet && <ShortWallet address={review.wallet} />}</dd>
          {review?.proofDays != null && <dd className="[font:500_12px_JetBrains_Mono] text-[#3FD17F]">{plural(t, 'bounty.sponsor.proofDays', review.proofDays)}</dd>}
        </div>
        <div className="flex flex-col gap-1">
          <dt className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.sponsor.delivery')}</dt>
          <dd className="min-w-0">
            {link ? (
              <a href={link} target="_blank" rel="noopener noreferrer" className="break-all [font:500_14px_Inter] text-[#3FD17F] underline">
                {link}
              </a>
            ) : (
              <span className="break-all [font:500_14px_Inter] text-[#E0655A]">{t('bounty.sponsor.noLink')}</span>
            )}
          </dd>
        </div>
        {review?.submissionNote && (
          <div className="flex flex-col gap-1">
            <dt className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.sponsor.note')}</dt>
            <dd className="whitespace-pre-line [font:400_14px/1.5_Inter] text-[#C9BFB0] [overflow-wrap:anywhere]">{review.submissionNote}</dd>
          </div>
        )}
      </dl>
      {result?.outcome === 'settled' && (
        <Notice tone="good" testId="bounty-approved">
          {t('bounty.sponsor.paidDone')} {result.signature && <span className="[font:500_12px_JetBrains_Mono]">{result.signature.slice(0, 8)}…</span>}
        </Notice>
      )}
      {result?.outcome === 'pending' && <Notice testId="bounty-approve-pending">{t('bounty.sponsor.pending')}</Notice>}
      {approve.isError && <Notice tone="error">{errorText(approve.error)}</Notice>}
      {reject.isError && <Notice tone="error">{errorText(reject.error)}</Notice>}
      {rejecting && (
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>{t('bounty.sponsor.rejectNote')}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} className={INPUT} data-testid="bounty-reject-note" />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => approve.mutate({ bounty: bounty.id, note: '' })} className={`${BTN_PRIMARY} ${BTN_SMALL}`} data-testid="bounty-approve">
          {approve.isPending ? t('bounty.working') : result?.outcome === 'pending' ? t('bounty.sponsor.checkAgain') : t('bounty.sponsor.approve')}
        </button>
        {!rejecting ? (
          <button type="button" disabled={busy} onClick={() => setRejecting(true)} className={`${BTN_SECONDARY} ${BTN_SMALL}`} data-testid="bounty-reject">
            {t('bounty.sponsor.reject')}
          </button>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => reject.mutate({ bounty: bounty.id, note })} className={`${BTN_SECONDARY} ${BTN_SMALL}`} data-testid="bounty-reject-confirm">
              {reject.isPending ? t('bounty.working') : t('bounty.sponsor.rejectConfirm')}
            </button>
            <button type="button" onClick={() => setRejecting(false)} className={`${BTN_SECONDARY} ${BTN_SMALL}`}>
              {t('bounty.withdraw.no')}
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export function FundingItem({ bounty }: { bounty: SponsorBounty }) {
  const { t } = useI18n();
  const fund = useFundBounty();
  const refresh = useRefreshBounty();
  const errorText = useErrorText();
  return (
    <li className={`${CARD} flex flex-col gap-3 p-4`} data-testid="bounty-funding-item">
      <Head bounty={bounty} />
      <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('bounty.sponsor.fundHint')}</p>
      {fund.isError && <Notice tone="error">{errorText(fund.error)}</Notice>}
      {refresh.isError && <Notice tone="error">{errorText(refresh.error)}</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        {bounty.treasuryFundable && (
          <button type="button" disabled={fund.isPending} onClick={() => fund.mutate(bounty.id)} className={`${BTN_PRIMARY} ${BTN_SMALL}`} data-testid="bounty-fund">
            {fund.isPending ? t('bounty.working') : t('bounty.sponsor.fund')}
          </button>
        )}
        {bounty.fundBlinkUrl && (
          <a href={bounty.fundBlinkUrl} target="_blank" rel="noopener noreferrer" className={`${BTN_SECONDARY} ${BTN_SMALL}`} data-testid="bounty-blink">
            {t('bounty.sponsor.blink')} ↗
          </a>
        )}
        <button type="button" disabled={refresh.isPending} onClick={() => refresh.mutate(bounty.id)} className={`${BTN_SECONDARY} ${BTN_SMALL}`} data-testid="bounty-check-funding">
          {refresh.isPending ? t('bounty.working') : t('bounty.sponsor.checkFunding')}
        </button>
      </div>
      <RefundButton bounty={bounty} />
    </li>
  );
}

export function PlainItem({ bounty }: { bounty: SponsorBounty }) {
  const { t } = useI18n();
  const closed = bounty.payout ?? bounty.refund;
  return (
    <li className={`${CARD} flex flex-col gap-3 p-4`} data-testid="bounty-plain-item">
      <Head bounty={bounty} />
      {bounty.claim && <div className="flex items-center gap-2"><span className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.sponsor.learner')}</span><ShortWallet address={bounty.claim.wallet} /></div>}
      {closed && <ExplorerAnchor href={closed.explorerUrl} label={bounty.payout ? t('bounty.paid.tx') : t('bounty.sponsor.refundTx')} />}
      <RefundButton bounty={bounty} />
    </li>
  );
}
