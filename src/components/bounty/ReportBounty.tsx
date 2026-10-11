import { useState, type FormEvent } from 'react';
import { INPUT, LABEL, Notice } from '@/components/bounty/bountyUi';
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SMALL, FOCUS } from '@/components/shop/shopStyles';
import { useBountySession, useReportBounty } from '@/hooks/useBounties';
import { useI18n } from '@/i18n';
import type { Bounty } from '@/types/bounty';

export function ReportBounty({ bounty }: { bounty: Bounty }) {
  const { t } = useI18n();
  const { signedIn } = useBountySession();
  const report = useReportBounty();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [short, setShort] = useState(false);
  if (!signedIn || bounty.postedBy.kind !== 'wallet') return null;

  if (report.isSuccess) return <Notice tone="good" testId="bounty-report-thanks">{t('bounty.report.thanks')}</Notice>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`inline-flex min-h-11 items-center self-start rounded [font:500_12px_JetBrains_Mono] text-[#A0978A] underline hover:text-[#F4EDE2] ${FOCUS}`} data-testid="bounty-report-open">
        {t('bounty.report.cta')}
      </button>
    );
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const clean = reason.trim();
    setShort(clean.length < 3);
    if (clean.length < 3) return;
    report.mutate({ bounty: bounty.id, reason: clean });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate data-testid="bounty-report-form">
      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>{t('bounty.report.reason')}</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} className={INPUT} aria-invalid={short} data-testid="bounty-report-reason" />
        <span className="self-end [font:500_11px_JetBrains_Mono] text-[#5E574E]">{reason.length}/300</span>
      </label>
      {short && <Notice tone="error">{t('bounty.report.short')}</Notice>}
      {report.isError && <Notice tone="error">{t('bounty.err.generic')}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={report.isPending} className={`${BTN_PRIMARY} ${BTN_SMALL}`} data-testid="bounty-report-send">
          {report.isPending ? t('bounty.working') : t('bounty.report.send')}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={`${BTN_SECONDARY} ${BTN_SMALL}`}>
          {t('bounty.report.cancel')}
        </button>
      </div>
    </form>
  );
}
