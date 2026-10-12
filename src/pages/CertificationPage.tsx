import { Link, Navigate, useParams } from 'react-router-dom';
import { AppTopBar } from '@/components/header/AppTopBar';
import '@/components/dashboard/dashboard.css';
import { CertificationClaims } from '@/components/passport/CertificationClaims';
import { CertificationHero } from '@/components/passport/CertificationHero';
import { TeraLoader } from '@/components/tera/TeraLoader';
import { LinkWalletButton } from '@/components/wallet/LinkWalletButton';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePassportView } from '@/hooks/usePassportView';
import { useI18n } from '@/i18n';

const GRID = {
  backgroundColor: '#0A0908',
  backgroundImage: 'linear-gradient(#15130F 1px,transparent 1px),linear-gradient(90deg,#15130F 1px,transparent 1px)',
  backgroundSize: '26px 26px',
} as const;

const ACTION =
  "inline-flex min-h-12 items-center justify-center rounded-xl border-0 border-b-[4px] border-b-[#1F8A4F] bg-[#3FD17F] px-5 [font:700_20px_'Barlow_Condensed'] text-[#0A0908] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4EDE2]";

/** /certifications/:trailId: one certification. The certificate on top, then its claims map; nothing else. */
export default function CertificationPage() {
  const { trailId = '' } = useParams();
  const { t } = useI18n();
  const view = usePassportView();
  const position = view.pages.findIndex((p) => p.trailId === trailId);
  const page = position >= 0 ? view.pages[position] : null;
  usePageTitle(page?.trailTitle ?? t('passport.pages'));

  if (!view.isPending && !view.isError && !page) return <Navigate to="/certifications" replace />;

  return (
    <div className="dash-root min-h-screen overflow-x-hidden text-[#F4EDE2]" style={GRID} data-testid="certification-page">
      <AppTopBar />
      <main className="mx-auto flex max-w-[1100px] flex-col gap-8 px-4 pb-24 pt-5 sm:px-8 lg:pb-14 xl:pt-8">
        <Link to="/certifications" className="inline-flex min-h-11 items-center self-start [font:700_13px_JetBrains_Mono] uppercase tracking-[.08em] text-[#A0978A] hover:text-[#F4EDE2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]" data-testid="certification-back">
          ← {t('cert.back')}
        </Link>
        {view.isError && !page && (
          <button type="button" onClick={view.refetch} className={`${ACTION} self-start`}>
            {t('passport.retry')}
          </button>
        )}
        {view.isPending && !page && <TeraLoader size="md" label={t('passport.credential.loading')} data-testid="certification-loading" />}
        {page && (
          <>
            <CertificationHero
              page={page}
              action={
                view.walletAddress ? (
                  <Link to="/" className={ACTION} data-testid="certification-start">
                    {t('cert.start')}
                  </Link>
                ) : (
                  <LinkWalletButton className={ACTION} />
                )
              }
            />
            <CertificationClaims wallet={view.walletAddress} title={page.trailTitle} position={position} />
          </>
        )}
      </main>
    </div>
  );
}
