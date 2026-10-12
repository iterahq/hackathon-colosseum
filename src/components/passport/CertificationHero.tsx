import type { ReactNode } from 'react';
import { useI18n } from '@/i18n';
import { addressUrl } from '@/lib/explorer';
import type { PassportPageData } from '@/types/achievements';
import { tierLabel } from '@/utils/tier';
import { CertificateBlank } from './CertificateBlank';
import { certificationState } from './CertificationCard';
import { PassportArt } from './PassportArt';
import { pageArtSrc, pageColor, pageVariant } from './pageVariant';

const EXPLORER =
  "inline-flex min-h-[60px] items-center justify-center gap-2 rounded-xl border-0 border-b-[6px] border-b-[#1F8A4F] bg-[#3FD17F] px-6 [font:700_24px_'Barlow_Condensed'] text-[#0A0908] transition-transform duration-75 hover:bg-[#5BE095] active:translate-y-[5px] active:border-b-[1px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4EDE2]";

interface Props {
  page: PassportPageData;
  /** Shown in place of the explorer link while the certificate is not on chain (link a wallet, go to the trail). */
  action?: ReactNode;
}

/**
 * The top of a certification's page: the certificate itself, large, and beside it the three things worth reading:
 * its name, the days stamped, and the one link that opens the asset on the Solana explorer.
 */
export function CertificationHero({ page, action }: Props) {
  const { t, locale } = useI18n();
  const state = certificationState(page);
  const art = pageArtSrc(page, locale);
  const asset = page.mintStatus === 'minted' ? page.assetAddress : null;
  const total = Math.max(1, page.totalDays);

  return (
    <section className="grid items-center gap-6 rounded-[20px] border border-[#262320] bg-[radial-gradient(ellipse_at_30%_0%,#16221b_0%,#141210_60%)] p-4 sm:p-8 md:grid-cols-[minmax(0,460px)_minmax(0,1fr)] md:gap-10" data-testid="certification-hero" data-state={state}>
      <div className="flex justify-center">
        {art ? (
          <PassportArt src={art} title={page.trailTitle} color={pageColor(page)} total={page.totalDays} done={page.daysStamped} variant={pageVariant(page)} width={460} ribbon={t('passport.ribbon')} />
        ) : (
          <CertificateBlank title={page.trailTitle} total={page.totalDays} done={page.daysStamped} locked={state === 'locked'} width={460} />
        )}
      </div>
      <div className="flex min-w-0 flex-col items-start gap-5">
        <h1 className="[font:700_64px/0.95_'Barlow_Condensed'] text-[#F4EDE2] max-sm:text-[48px]" data-testid="certification-title">
          {page.trailTitle}
        </h1>
        <div className="flex w-full max-w-[360px] flex-col gap-2">
          <p className="flex items-baseline gap-3">
            <span className="[font:700_44px/1_'Barlow_Condensed'] text-[#3FD17F]" data-testid="certification-days">
              {t('passport.days', { done: page.daysStamped, total: page.totalDays })}
            </span>
            {page.tier && state !== 'notStarted' && (
              <span className="rounded-full border border-[#3A342D] px-2.5 py-1 [font:700_11px_JetBrains_Mono] uppercase tracking-[.08em] text-[#C9BFB0]">{tierLabel(t, page.tier)}</span>
            )}
          </p>
          <div className="flex gap-1.5" aria-hidden>
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={`h-2.5 flex-1 rounded-full ${i < page.daysStamped ? 'bg-[#3FD17F]' : 'bg-[#262320]'}`} />
            ))}
          </div>
        </div>
        {asset ? (
          <a href={addressUrl(asset)} target="_blank" rel="noopener noreferrer" className={EXPLORER} title={t('cert.explorer.hint')} data-testid="certification-explorer-link">
            ◎ {t('cert.explorer')} ↗
          </a>
        ) : (
          <>
            <p className="[font:500_14px/1.4_Inter] text-[#A0978A]" data-testid="certification-not-onchain">
              {t('cert.notOnChain')}
            </p>
            {action}
          </>
        )}
      </div>
    </section>
  );
}
