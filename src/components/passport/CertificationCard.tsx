import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';
import type { PassportPageData } from '@/types/achievements';
import { isGold } from '@/utils/passport';
import { CertificateBlank } from './CertificateBlank';
import { PassportArt } from './PassportArt';
import { pageArtSrc, pageColor, pageVariant } from './pageVariant';

export type CertificationState = 'locked' | 'notStarted' | 'inProgress' | 'complete';

export const certificationState = (page: PassportPageData): CertificationState =>
  page.locked ? 'locked' : isGold(page) ? 'complete' : page.daysDone > 0 || page.daysStamped > 0 ? 'inProgress' : 'notStarted';

/** Where a certification opens. */
export const certificationPath = (trailId: string): string => `/certifications/${encodeURIComponent(trailId)}`;

const CHIP: Record<CertificationState, string> = {
  locked: 'border-[#3A342D] text-[#A0978A]',
  notStarted: 'border-[#3A342D] text-[#A0978A]',
  inProgress: 'border-[#3FD17F] text-[#3FD17F]',
  complete: 'border-[#F2C66D] text-[#F2C66D]',
};

/** One certification of the program on the list: its certificate, its name and how far the learner is. Grey until started. */
export function CertificationCard({ page }: { page: PassportPageData }) {
  const { t, locale } = useI18n();
  const state = certificationState(page);
  const started = state === 'inProgress' || state === 'complete';
  const minted = page.mintStatus === 'minted' && Boolean(page.assetAddress);
  const art = pageArtSrc(page, locale);
  const ratio = Math.min(1, page.daysStamped / Math.max(1, page.totalDays));

  const body = (
    <>
      <span className="flex justify-center">
        {art ? (
          <PassportArt src={art} title={page.trailTitle} color={pageColor(page)} total={page.totalDays} done={page.daysStamped} variant={pageVariant(page)} width={260} ribbon={t('passport.ribbon')} />
        ) : (
          <CertificateBlank title={page.trailTitle} total={page.totalDays} done={page.daysStamped} locked={state === 'locked'} />
        )}
      </span>
      <span className="flex items-baseline justify-between gap-3">
        <span className="truncate [font:700_30px/1_'Barlow_Condensed'] text-[#F4EDE2]">{page.trailTitle}</span>
        <span className="shrink-0 [font:700_13px_JetBrains_Mono] text-[#C9BFB0]" data-testid="certification-days">
          {t('passport.days', { done: page.daysStamped, total: page.totalDays })}
        </span>
      </span>
      <span className="block h-2 overflow-hidden rounded-full bg-[#262320]" aria-hidden>
        <span className="block h-full rounded-full bg-[#3FD17F]" style={{ width: `${ratio * 100}%` }} />
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex min-h-[26px] items-center rounded-full border px-2.5 [font:700_11px_JetBrains_Mono] uppercase tracking-[.06em] ${CHIP[state]}`} data-testid="certification-state">
          {state === 'locked' ? t('passport.unlocksAfter', { name: page.lockedBy ?? page.trailTitle }) : t(`cert.state.${state}`)}
        </span>
        {minted && (
          <span className="inline-flex min-h-[26px] items-center rounded-full border border-[#3FD17F] bg-[#1C3A2A] px-2.5 [font:700_11px_JetBrains_Mono] text-[#3FD17F]" data-testid="certification-onchain">
            ◎ {t('passport.onChain')}
          </span>
        )}
      </span>
    </>
  );

  const box = `flex w-full max-w-[320px] flex-col gap-3 justify-self-center rounded-[18px] border bg-[#141210] p-4 text-left ${
    started ? 'border-[#2E2A25]' : 'border-[#262320] opacity-60 grayscale'
  }`;

  if (state === 'locked') {
    return (
      <div className={box} data-testid="certification-card" data-state={state} aria-disabled="true">
        {body}
      </div>
    );
  }
  return (
    <Link
      to={certificationPath(page.trailId)}
      className={`${box} transition-[border-color,opacity,filter] hover:border-[#3FD17F] hover:opacity-100 hover:grayscale-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3FD17F]`}
      // A started card keeps the id the browser end-to-end run waits for on this page.
      data-testid={started ? 'passport-full-card' : 'certification-card'}
      data-state={state}
    >
      {body}
    </Link>
  );
}
