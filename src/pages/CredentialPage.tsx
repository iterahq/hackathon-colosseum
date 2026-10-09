import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CredentialCard } from '@/components/passport/CredentialCard';
import { PassportPage } from '@/components/passport/PassportPage';
import { useCredential } from '@/hooks/useCredential';
import { useI18n } from '@/i18n';
import { credentialFacts } from '@/utils/credential';
import { TRAIL_COLORS } from '@/utils/trailDashboard';

const GRID = {
  backgroundColor: '#0A0908',
  backgroundImage: 'linear-gradient(#15130F 1px,transparent 1px),linear-gradient(90deg,#15130F 1px,transparent 1px)',
  backgroundSize: '26px 26px',
} as const;

const BTN =
  "inline-flex h-[60px] w-full items-center justify-center rounded-xl border-0 border-b-[6px] border-b-[#1F8A4F] bg-[#3FD17F] px-6 [font:700_24px_'Barlow_Condensed'] text-[#0A0908] transition-transform duration-75 active:translate-y-[5px] active:border-b-[1px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4EDE2]";

const NOTE = 'rounded-[14px] border border-[#262320] bg-[#141210] p-5 [font:500_14px_Inter] text-[#C9BFB0]';

function VerifyOther() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  return (
    <form
      className="mt-4 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) navigate(`/c/${encodeURIComponent(value.trim())}`);
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={t('passport.credential.placeholder')}
        placeholder={t('passport.credential.placeholder')}
        className="h-11 min-w-0 flex-1 rounded-lg border border-[#2E2A25] bg-[#0A0908] px-3 [font:500_13px_JetBrains_Mono] text-[#F4EDE2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]"
      />
      <button type="submit" className="h-11 rounded-lg border border-[#3FD17F] px-4 [font:700_13px_JetBrains_Mono] text-[#3FD17F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]">
        {t('passport.credential.verify')}
      </button>
    </form>
  );
}

/** Public, shell-less page: anyone can check a passport asset against the chain. */
export default function CredentialPage() {
  const { asset = '' } = useParams();
  const { t, tText, toggleLocale } = useI18n();
  const query = useCredential(asset);
  const lookup = query.data;
  const found = lookup && lookup.status !== 'not_found' ? lookup : null;
  const facts = found ? credentialFacts(found.data, tText) : null;
  const gold = facts != null && facts.totalDays > 0 && facts.daysDone === facts.totalDays;

  return (
    <div className="min-h-screen overflow-x-hidden text-[#F4EDE2]" style={GRID} data-testid="credential-page">
      <header className="mx-auto flex h-16 max-w-[960px] items-center justify-between px-4 sm:px-8">
        <Link to="/" className="[font:700_28px_'Barlow_Condensed'] tracking-[.02em] text-[#F4EDE2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]">
          ITERA<span className="text-[#3FD17F]">/</span>
        </Link>
        <button type="button" onClick={toggleLocale} className="inline-flex h-11 items-center rounded-full border border-[#262320] px-3.5 [font:500_13px_JetBrains_Mono] text-[#A0978A] hover:text-[#F4EDE2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]">
          {t('dash.nav.language')}
        </button>
      </header>
      <main className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-6 px-4 pb-14 pt-4 sm:pt-8">
        {query.isPending && (
          <div className="flex w-full flex-col items-center gap-4" data-testid="credential-loading" role="status">
            <div className="aspect-[3/4] w-[300px] max-w-full animate-pulse rounded-2xl bg-[#141210]" />
            <div className="h-[200px] w-full animate-pulse rounded-[14px] bg-[#141210]" />
            <span className="[font:500_13px_JetBrains_Mono] text-[#A0978A]">{t('passport.credential.loading')}</span>
          </div>
        )}
        {query.isError && (
          <div className={`${NOTE} w-full`} data-testid="credential-failed" role="alert">
            {t('passport.credential.failed')}
            <button type="button" onClick={() => void query.refetch()} className="mt-3 block h-11 rounded-lg border border-[#3FD17F] px-4 [font:700_13px_JetBrains_Mono] text-[#3FD17F]">
              {t('passport.retry')}
            </button>
          </div>
        )}
        {lookup?.status === 'not_found' && (
          <div className={`${NOTE} w-full`} data-testid="credential-not-found">
            <p className="[font:700_26px_'Barlow_Condensed'] text-[#F4EDE2]">{t('passport.credential.notFound')}</p>
            <p className="mt-1 [font:500_12px_JetBrains_Mono] break-all text-[#A0978A]">{asset}</p>
            <p className="mt-4 [font:500_12px_JetBrains_Mono] text-[#A0978A]">{t('passport.credential.verifyOther')}</p>
            <VerifyOther />
          </div>
        )}
        {found && facts && (
          <>
            <PassportPage
              title={facts.trail ?? t('passport.title')}
              color={TRAIL_COLORS[1]}
              total={Math.max(facts.totalDays, 1)}
              done={facts.daysDone}
              variant={gold ? 'gold' : 'active'}
              ribbon={t('passport.ribbon')}
            />
            <CredentialCard lookup={found} />
          </>
        )}
        <Link to="/" className={BTN}>
          {t('passport.credential.cta')}
        </Link>
      </main>
    </div>
  );
}
