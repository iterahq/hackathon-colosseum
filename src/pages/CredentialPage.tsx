import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArtZoom } from '@/components/artviewer';
import { TeraNote } from '@/components/tera/TeraNote';
import { TeraLoader } from '@/components/tera/TeraLoader';
import { ArchiveCopies } from '@/components/chain/ArchiveCopies';
import { ReadWithoutItera } from '@/components/verify/ReadWithoutItera';
import { CredentialCard } from '@/components/passport/CredentialCard';
import { PassportArt } from '@/components/passport/PassportArt';
import { useCredential, useRecheckCredential } from '@/hooks/useCredential';
import { HeaderLocale } from '@/components/header/HeaderLocale';
import { useI18n } from '@/i18n';
import { companionFacts, credentialFacts, isCompanion, looksLikeAddress } from '@/utils/credential';
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

function CompanionImage({ src, lang, title, asset }: { src: string | null; lang: string; title: string; asset: string }) {
  if (!src) return null;
  const full = src.includes('lang=') ? src : `${src}${src.includes('?') ? '&' : '?'}lang=${lang}`;
  return (
    <ArtZoom title={title} src={full} asset={asset} className="w-full max-w-[360px]">
      <img src={full} alt="" className="w-full rounded-2xl border border-[#262320]" data-testid="credential-companion-art" />
    </ArtZoom>
  );
}

/** Public, shell-less page: anyone can check a passport asset against the chain. */
export default function CredentialPage() {
  const { asset = '' } = useParams();
  const { t, tText, locale } = useI18n();
  const query = useCredential(asset, locale);
  const recheck = useRecheckCredential(asset, locale);
  const lookup = query.data;
  const found = lookup && lookup.status !== 'not_found' ? lookup : null;
  const facts = found ? credentialFacts(found.data, tText, locale) : null;
  const gold = facts != null && facts.totalDays > 0 && facts.daysDone === facts.totalDays;

  return (
    <div className="min-h-screen overflow-x-hidden text-[#F4EDE2]" style={GRID} data-testid="credential-page">
      <header className="mx-auto flex h-16 max-w-[960px] items-center justify-between px-4 sm:px-8">
        <Link to="/" className="[font:700_28px_'Barlow_Condensed'] tracking-[.02em] text-[#F4EDE2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]">
          ITERA<span className="text-[#3FD17F]">/</span>
        </Link>
        <HeaderLocale size="lg" />
      </header>
      <main className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-6 px-4 pb-14 pt-4 sm:pt-8">
        {query.isPending && <TeraLoader size="md" label={t('passport.credential.loading')} data-testid="credential-loading" />}
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
            <TeraNote mood="oops" title={t('tera.credential.notFound')} body={t('passport.credential.notFound')} className="!pt-2 pb-2" />
            {looksLikeAddress(asset) && <p className="mt-1 [font:500_12px_JetBrains_Mono] break-all text-[#A0978A]">{asset}</p>}
            <p className="mt-4 [font:500_12px_JetBrains_Mono] text-[#A0978A]">{t('passport.credential.verifyOther')}</p>
            <VerifyOther />
          </div>
        )}
        {found && facts && (
          <>
            {found.status === 'verified' && isCompanion(found.data) && (
              <CompanionImage src={companionFacts(found.data).image} lang={locale} title={t('shop.companion.title')} asset={found.data.asset} />
            )}
            {found.status === 'verified' && !isCompanion(found.data) && (
              <ArtZoom title={facts.trail ?? t('passport.title')} line={t('viewer.cert.line', { done: facts.daysDone, total: facts.totalDays })} src={found.data.achievement?.image_url ? `${found.data.achievement.image_url}${found.data.achievement.image_url.includes('?') ? '&' : '?'}lang=${locale}` : null} asset={found.data.asset} aspect={3 / 4}>
                <PassportArt
                  src={found.data.achievement?.image_url ? `${found.data.achievement.image_url}${found.data.achievement.image_url.includes('?') ? '&' : '?'}lang=${locale}` : null}
                  title={facts.trail ?? t('passport.title')}
                  color={TRAIL_COLORS[1]}
                  total={Math.max(facts.totalDays, 1)}
                  done={facts.daysDone}
                  variant={gold ? 'gold' : 'active'}
                  ribbon={t('passport.ribbon')}
                />
              </ArtZoom>
            )}
            {found.status === 'unverified' && <TeraNote mood="oops" size="bubble" title={t('tera.credential.unverified')} className="!pt-2" data-testid="credential-tera" />}
            <CredentialCard lookup={found} onRecheck={() => recheck.mutate()} rechecking={recheck.isPending} />
            {found.data.asset && <ReadWithoutItera asset={found.data.asset} />}
            {found.data.asset && found.status === 'verified' && <ArchiveCopies asset={found.data.asset} />}
          </>
        )}
        <Link to="/" className={BTN}>
          {t('passport.credential.cta')}
        </Link>
      </main>
    </div>
  );
}
