import { useState, type FormEvent } from 'react';
import { ExplorerAnchor, INPUT, LABEL, Notice, SECTION_TITLE } from '@/components/bounty/bountyUi';
import { BTN_PRIMARY, CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import type { useJudgeSubmit } from '@/hooks/useBounties';
import { useI18n } from '@/i18n';
import { bountyErrorCode } from '@/services/bounty.service';
import { formatWhen, lamportsToSol, plural } from '@/utils/bounty';
import { checkRows, judgeSlotsText } from '@/utils/bountyJudge';
import type { BountyDetail, CheckReport, JudgeInfo, JudgeSummary } from '@/types/bounty';

type JudgeSubmit = ReturnType<typeof useJudgeSubmit>;

export function JudgeChip() {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center rounded-full border border-[#F2C66D] px-2.5 py-1 ${MONO_LABEL} text-[#F2C66D]`} data-testid="bounty-judge-chip">
      {t('bounty.judge.chip')}
    </span>
  );
}

export function JudgeCaption({ className = '', judge = null }: { className?: string; judge?: JudgeInfo | null }) {
  const { t } = useI18n();
  const slots = judge ? judgeSlotsText(t, judge) : null;
  return (
    <p className={`[font:500_12px/1.4_JetBrains_Mono] text-[#A0978A] ${className}`} data-testid="bounty-judge-caption">
      {t('bounty.judge.caption')}
      {slots && <span className="block text-[#F2C66D]" data-testid="bounty-judge-slots">{slots}</span>}
    </p>
  );
}

function Mark({ state }: { state: 'pass' | 'fail' | 'unknown' }) {
  const { t } = useI18n();
  if (state === 'pass') return <span className="shrink-0 [font:700_13px_JetBrains_Mono] text-[#3FD17F]" aria-label={t('bounty.judge.passed')}>✓</span>;
  if (state === 'fail') return <span className="shrink-0 [font:700_13px_JetBrains_Mono] text-[#E0655A]" aria-label={t('bounty.judge.failed')}>✗</span>;
  return <span className="shrink-0 [font:700_13px_JetBrains_Mono] text-[#5E574E]" aria-hidden>•</span>;
}

export function CheckList({ judge, report, testId }: { judge: JudgeInfo; report: CheckReport | null; testId: string }) {
  return (
    <ul className="flex flex-col gap-1.5" data-testid={testId}>
      {checkRows(judge, report).map((row) => (
        <li key={row.id} className="flex items-start gap-2 [font:400_14px/1.45_Inter] text-[#C9BFB0]" data-state={row.state}>
          <Mark state={row.state} />
          <span className="min-w-0 [overflow-wrap:anywhere]">{row.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function JudgeChecksSection({ bounty }: { bounty: BountyDetail }) {
  const { t } = useI18n();
  if (!bounty.judge) return null;
  return (
    <section className={`${CARD} flex flex-col gap-3 p-4 sm:p-5`} aria-labelledby="bounty-judge-checks" data-testid="bounty-judge">
      <h2 id="bounty-judge-checks" className={SECTION_TITLE}>{t('bounty.judge.checksTitle')}</h2>
      <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('bounty.judge.checksPlain')}</p>
      <CheckList judge={bounty.judge} report={null} testId="bounty-judge-checks-list" />
    </section>
  );
}

const SERVER_ERRORS = ['invalid_submission', 'not_active'];

export function JudgeDeliverForm({ bounty, judge }: { bounty: BountyDetail; judge: JudgeSubmit }) {
  const { t } = useI18n();
  const info = bounty.judge;
  const [code, setCode] = useState('');
  if (!info) return null;
  const code_ = bountyErrorCode(judge.error);
  const failed = judge.result && !judge.result.submitted ? judge.result : null;
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim() === '' || judge.pending) return;
    judge.run({ bounty: bounty.id, code });
  };
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate data-testid="bounty-judge-form">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="bounty-code" className={LABEL}>{t('bounty.judge.codeLabel')}</label>
        <p className="[font:400_13px/1.5_Inter] text-[#A0978A]">{t('bounty.judge.hint')}</p>
        <textarea
          id="bounty-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={info.codeMax}
          rows={12}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder={'<!doctype html>\n<html lang="en">\n  <head>…</head>\n  <body>…</body>\n</html>'}
          className={`${INPUT} min-h-[220px] [font:500_13px/1.5_JetBrains_Mono] whitespace-pre [overflow-wrap:normal] overflow-x-auto`}
          data-testid="bounty-code"
        />
        <span className="self-end [font:500_11px_JetBrains_Mono] text-[#5E574E]" data-testid="bounty-code-counter">{code.length}/{info.codeMax}</span>
      </div>
      {judge.pending && judge.phase === 'checking' && <Notice testId="bounty-judge-checking">{t('bounty.judge.checking')}</Notice>}
      {failed && !judge.pending && (
        <Notice tone="error" testId="bounty-judge-failed">
          <CheckList judge={info} report={failed.report} testId="bounty-judge-result" />
          <span className="mt-2 block">{t('bounty.judge.retry')}</span>
        </Notice>
      )}
      {judge.error !== null && !judge.pending && <Notice tone="error">{code_ && SERVER_ERRORS.includes(code_) ? t(`bounty.err.submit.${code_}`) : code_ === 'rate_limited' ? t('bounty.err.sign.rate_limited') : t('bounty.err.generic')}</Notice>}
      <button type="submit" disabled={judge.pending || code.trim() === ''} className={`${BTN_PRIMARY} w-full sm:w-auto sm:self-start`} data-testid="bounty-judge-submit">
        {judge.pending ? t('bounty.working') : t('bounty.judge.submit')}
      </button>
    </form>
  );
}

export function JudgeProgress({ judge, paid }: { judge: JudgeSubmit; paid: boolean }) {
  const { t } = useI18n();
  const result = judge.result;
  if (!result || !result.submitted) return null;
  const payout = result.payout;
  const settled = paid || payout.status === 'paid';
  const link = payout.explorerUrl ? <ExplorerAnchor href={payout.explorerUrl} label={t('bounty.paid.tx')} /> : null;
  return (
    <Notice tone="good" testId="bounty-judge-progress">
      {settled ? (
        <span className="block">{t('bounty.judge.paid', { sol: payout.lamports === null ? '' : lamportsToSol(payout.lamports) })}</span>
      ) : (
        <>
          <span className="block">{t('bounty.judge.paying')}</span>
          {!judge.pending && <span className="mt-1 block">{t('bounty.judge.confirming')}</span>}
        </>
      )}
      {link}
    </Notice>
  );
}

export function JudgePaidBlock({ bounty }: { bounty: BountyDetail }) {
  const { t } = useI18n();
  const claim = bounty.claim;
  if (!bounty.judge || bounty.status !== 'paid' || !claim || (!claim.submissionCode && !claim.checkReport)) return null;
  return (
    <section className={`${CARD} flex flex-col gap-3 p-4 sm:p-5`} aria-labelledby="bounty-judge-result" data-testid="bounty-judge-paid">
      <h2 id="bounty-judge-result" className={SECTION_TITLE}>{t('bounty.judge.resultTitle')}</h2>
      <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('bounty.judge.resultPlain')}</p>
      <CheckList judge={bounty.judge} report={claim.checkReport} testId="bounty-judge-report" />
      {claim.submissionCode && (
        <>
          <span className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.judge.deliveredCode')}</span>
          <pre className="max-h-[420px] max-w-full overflow-auto rounded-[10px] bg-[#0A0908] p-3 [font:500_12px/1.5_JetBrains_Mono] text-[#C9BFB0]" data-testid="bounty-judge-code">{claim.submissionCode}</pre>
        </>
      )}
    </section>
  );
}

export function JudgeBoardBlock({ judge, paidCount }: { judge: JudgeSummary; paidCount: number }) {
  const { t, locale } = useI18n();
  if (paidCount <= 0 && judge.latest.length === 0) return null;
  const title = paidCount > 0 ? plural(t, 'bounty.judge.board.title', paidCount) : t('bounty.judge.board.title.testsOnly');
  return (
    <section className="flex flex-col gap-2" aria-label={title} data-testid="bounty-judge-board">
      <p className={`${MONO_LABEL} text-[#F2C66D]`}>{title}</p>
      {judge.latest.length > 0 && (
        <ul className="flex flex-col gap-1">
          {judge.latest.map((payout) => (
            <li key={`${payout.slug}-${payout.paidAt ?? ''}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 [font:500_12px_JetBrains_Mono] text-[#C9BFB0]" data-testid="bounty-judge-latest">
              <span>{payout.walletShort}</span>
              {payout.paidAt && <time dateTime={payout.paidAt} className="text-[#A0978A]">{formatWhen(payout.paidAt, locale)}</time>}
              {payout.teamTest && <span className="rounded-full border border-[#2E2A25] px-2 py-0.5 text-[#A0978A]">{t('bounty.judge.board.teamTest')}</span>}
              <ExplorerAnchor href={payout.explorerUrl} label={t('bounty.ledger.explorer')} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
