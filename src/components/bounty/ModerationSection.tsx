import { useState } from 'react';
import { Link } from 'react-router-dom';
import { INPUT, LABEL, LoadError, Notice, SECTION_TITLE, Skeleton } from '@/components/bounty/bountyUi';
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SMALL, CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { useModeration, useSetHidden } from '@/hooks/useBounties';
import { useI18n } from '@/i18n';
import { shortAddress } from '@/lib/explorer';
import { bountyErrorCode } from '@/services/bounty.service';
import { lamportsToSol, plural } from '@/utils/bounty';
import type { ModerationBounty } from '@/types/bounty';

function Row({ bounty }: { bounty: ModerationBounty }) {
  const { t } = useI18n();
  const setHidden = useSetHidden();
  const [showReports, setShowReports] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [reason, setReason] = useState('');
  const hidden = bounty.hiddenAt !== null;

  return (
    <li className={`${CARD} flex flex-col gap-3 p-4`} data-testid="bounty-mod-item" data-hidden={hidden}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to={`/bounties/${bounty.slug}`} className={`${MONO_LABEL} truncate text-[#3FD17F] hover:underline`}>
          /{bounty.slug}
        </Link>
        <span className={`${MONO_LABEL} text-[#A0978A]`}>{bounty.status} · {lamportsToSol(bounty.rewardLamports)} SOL</span>
      </div>
      <h3 className="[font:700_22px/1.1_'Barlow_Condensed'] text-[#F4EDE2] [overflow-wrap:anywhere]">{bounty.title}</h3>
      <p className="[font:500_13px/1.5_Inter] text-[#C9BFB0]">
        {t('bounty.mod.sponsor')}: {bounty.sponsorName}
        {bounty.sponsorWallet && <span className="ml-2 [font:500_12px_JetBrains_Mono]" title={bounty.sponsorWallet}>{shortAddress(bounty.sponsorWallet)}</span>}
      </p>
      {hidden && <Notice testId="bounty-mod-hidden">{t('bounty.mod.hiddenTag', { reason: bounty.hiddenReason ?? t('bounty.mod.hiddenNoReason') })}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        <span className="[font:700_13px_JetBrains_Mono] text-[#F4EDE2]" data-testid="bounty-mod-reports">{plural(t, 'bounty.mod.reports', bounty.reports.length)}</span>
        {bounty.reports.length > 0 && (
          <button type="button" onClick={() => setShowReports((v) => !v)} aria-expanded={showReports} className="inline-flex min-h-11 items-center [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline" data-testid="bounty-mod-toggle">
            {showReports ? t('bounty.mod.hideReports') : t('bounty.mod.showReports')}
          </button>
        )}
      </div>
      {showReports && (
        <ul className="flex flex-col gap-2 rounded-[10px] bg-[#0A0908] p-3" data-testid="bounty-mod-reasons">
          {bounty.reports.map((report, index) => (
            <li key={`${report.createdAt ?? ''}-${index}`} className="whitespace-pre-line [font:400_14px/1.5_Inter] text-[#C9BFB0] [overflow-wrap:anywhere]">
              {report.reason}
            </li>
          ))}
        </ul>
      )}
      {setHidden.isError && <Notice tone="error">{t('bounty.err.generic')}</Notice>}
      {hidden ? (
        <button type="button" disabled={setHidden.isPending} onClick={() => setHidden.mutate({ bounty: bounty.id, hidden: false, reason: '' })} className={`${BTN_SECONDARY} ${BTN_SMALL} w-full sm:w-auto sm:self-start`} data-testid="bounty-mod-unhide">
          {setHidden.isPending ? t('bounty.working') : t('bounty.mod.unhide')}
        </button>
      ) : !hiding ? (
        <button type="button" onClick={() => setHiding(true)} className={`${BTN_SECONDARY} ${BTN_SMALL} w-full sm:w-auto sm:self-start`} data-testid="bounty-mod-hide">
          {t('bounty.mod.hide')}
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>{t('bounty.mod.reason')}</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={INPUT} data-testid="bounty-mod-reason" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={setHidden.isPending}
              onClick={() => setHidden.mutate({ bounty: bounty.id, hidden: true, reason }, { onSuccess: () => setHiding(false) })}
              className={`${BTN_PRIMARY} ${BTN_SMALL}`}
              data-testid="bounty-mod-hide-confirm"
            >
              {setHidden.isPending ? t('bounty.working') : t('bounty.mod.hideConfirm')}
            </button>
            <button type="button" onClick={() => setHiding(false)} className={`${BTN_SECONDARY} ${BTN_SMALL}`}>
              {t('bounty.report.cancel')}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Only for staff Itera trusts with moderation: the server answers 403 to everyone else and the section disappears. */
export function ModerationSection() {
  const { t } = useI18n();
  const moderation = useModeration();
  if (moderation.isError && bountyErrorCode(moderation.error) === 'forbidden') return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="bounty-moderation" data-testid="bounty-moderation">
      <h2 id="bounty-moderation" className={SECTION_TITLE}>{t('bounty.mod.title')}</h2>
      {moderation.isPending && <Skeleton className="h-24" />}
      {moderation.isError && <LoadError onRetry={() => void moderation.refetch()} testId="bounty-moderation-failed" />}
      {moderation.data && moderation.data.length === 0 && <p className="[font:500_14px_Inter] text-[#A0978A]">{t('bounty.mod.empty')}</p>}
      {moderation.data && moderation.data.length > 0 && (
        <ul className="flex flex-col gap-3">
          {moderation.data.map((bounty) => (
            <Row key={bounty.id} bounty={bounty} />
          ))}
        </ul>
      )}
    </section>
  );
}
