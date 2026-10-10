import { Link, useParams } from 'react-router-dom';
import { CertificationsSection, CompanionSection, ExplorerLink, MedalsSection, NoCompanion } from '@/components/passport/ProfileSections';
import { CopyButton } from '@/components/passport/CopyButton';
import { ProfileGift } from '@/components/gift/ProfileGift';
import { TeraLoader } from '@/components/tera/TeraLoader';
import { TERA_BUTTON, TeraNote } from '@/components/tera/TeraNote';
import { useLearnerProfile } from '@/hooks/useLearnerProfile';
import { useI18n } from '@/i18n';
import { shortAddress } from '@/lib/explorer';
import { looksLikeAddress } from '@/utils/credential';

const GRID = {
  backgroundColor: '#0A0908',
  backgroundImage: 'linear-gradient(#15130F 1px,transparent 1px),linear-gradient(90deg,#15130F 1px,transparent 1px)',
  backgroundSize: '26px 26px',
} as const;
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]';
const H2 = "[font:700_28px_'Barlow_Condensed']";

/** Public, shell-less page: everything a wallet earned on Itera, each item linking to its own /c/:asset. */
export default function LearnerProfilePage() {
  const { wallet = '' } = useParams();
  const { t, locale, toggleLocale } = useI18n();
  const valid = looksLikeAddress(wallet);
  const query = useLearnerProfile(valid ? wallet : '', locale);
  const lookup = query.data;
  const profile = lookup?.status === 'ok' ? lookup.profile : null;
  const empty = profile && !profile.companion && profile.certifications.length === 0 && profile.medals.length === 0;

  return (
    <div className="min-h-screen overflow-x-hidden text-[#F4EDE2]" style={GRID} data-testid="profile-page">
      <header className="mx-auto flex h-16 max-w-[960px] items-center justify-between px-4 sm:px-8">
        <Link to="/" className={`[font:700_28px_'Barlow_Condensed'] tracking-[.02em] text-[#F4EDE2] ${FOCUS}`}>
          ITERA<span className="text-[#3FD17F]">/</span>
        </Link>
        <button type="button" onClick={toggleLocale} className={`inline-flex h-11 items-center rounded-full border border-[#262320] px-3.5 [font:500_13px_JetBrains_Mono] text-[#A0978A] hover:text-[#F4EDE2] ${FOCUS}`}>
          {t('dash.nav.language')}
        </button>
      </header>
      <main className="mx-auto flex w-full max-w-[960px] flex-col gap-8 px-4 pb-14 pt-4 sm:pt-8">
        {valid && query.isPending && <TeraLoader size="md" label={t('passport.credential.loading')} />}
        {valid && query.isError && (
          <div role="alert" className="rounded-[14px] border border-[#262320] bg-[#141210] p-5 [font:500_14px_Inter] text-[#C9BFB0]" data-testid="profile-failed">
            {t('passport.credential.failed')}
            <button type="button" onClick={() => void query.refetch()} className="mt-3 block h-11 rounded-lg border border-[#3FD17F] px-4 [font:700_13px_JetBrains_Mono] text-[#3FD17F]">
              {t('passport.retry')}
            </button>
          </div>
        )}
        {(!valid || lookup?.status === 'invalid') && (
          <div className="rounded-[14px] border border-[#262320] bg-[#141210] p-5" data-testid="profile-invalid">
            <TeraNote mood="oops" title={t('profile.invalid')} className="!pt-2" />
          </div>
        )}
        {profile && (
          <>
            <section className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-[14px] border border-[#3FD17F] bg-[#141210] p-4 sm:p-5" data-testid="profile-band">
              <div className="flex min-w-0 items-center gap-3">
                <svg width="32" height="32" viewBox="0 0 28 28" fill="none" aria-hidden className="flex-none">
                  <circle cx="14" cy="14" r="12" stroke="#3FD17F" strokeWidth="2" />
                  <path d="M8 14.5l4 4 8-9" stroke="#3FD17F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="min-w-0">
                  <h1 className="truncate [font:700_34px/1_'Barlow_Condensed'] max-sm:text-[28px]" title={profile.wallet}>{shortAddress(profile.wallet)}</h1>
                  <p className="mt-1 [font:500_13px_JetBrains_Mono] text-[#3FD17F]">{t('profile.verified', { n: profile.verifiedCount })}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ExplorerLink address={profile.wallet} />
                <CopyButton value={`${window.location.origin}/u/${profile.wallet}`} label={t('profile.copyLink')} doneLabel={t('passport.copied')} display={t('profile.copyLink')} />
              </div>
            </section>
            <ProfileGift wallet={profile.wallet} />
            {profile.circuit.stampsFunded > 0 && (
              <p className="rounded-[14px] border border-[#262320] bg-[#141210] px-4 py-3 [font:500_14px/1.45_Inter] text-[#C9BFB0]" data-testid="profile-circuit">
                <span className="text-[#3FD17F]">{t('circuit.name')}</span> · {t('circuit.profile', { n: profile.circuit.stampsFunded.toLocaleString() })}
              </p>
            )}
            {empty ? (
              <div data-testid="profile-empty">
                <TeraNote mood="neutral" title={t('profile.emptyTitle')} body={t('profile.empty')} />
              </div>
            ) : (
              <>
                {profile.companion ? <CompanionSection companion={profile.companion} /> : <NoCompanion />}
                <section className="flex flex-col gap-4" aria-labelledby="profile-certs">
                  <h2 id="profile-certs" className={H2}>{t('profile.certs')}</h2>
                  <CertificationsSection items={profile.certifications} />
                </section>
                {profile.medals.length > 0 && (
                  <section className="flex flex-col gap-4" aria-labelledby="profile-medals">
                    <h2 id="profile-medals" className={H2}>{t('profile.medals')}</h2>
                    <MedalsSection items={profile.medals} />
                  </section>
                )}
              </>
            )}
            <footer className="flex flex-col items-center gap-3 border-t border-[#262320] pt-8 text-center">
              <p className="max-w-[420px] [font:500_14px/1.4_Inter] text-[#A0978A]">{t('profile.ctaHint')}</p>
              <Link to="/" className={`${TERA_BUTTON} w-full max-w-[320px]`} data-testid="profile-cta">{t('profile.cta')}</Link>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
