import { Link, useParams } from 'react-router-dom';
import { CertificationsSection, CompanionSection, MedalsSection } from '@/components/passport/ProfileSections';
import { CopyButton } from '@/components/passport/CopyButton';
import { TeraLoader } from '@/components/tera/TeraLoader';
import { TeraNote } from '@/components/tera/TeraNote';
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
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-4 pb-14 pt-4 sm:pt-8">
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
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="[font:700_44px/1_'Barlow_Condensed'] max-sm:text-[34px]">{t('profile.title')}</h1>
                <p className="mt-1 [font:500_13px_JetBrains_Mono] text-[#A0978A]" title={profile.wallet}>
                  {shortAddress(profile.wallet)} · {t('profile.verified', { n: profile.verifiedCount })}
                </p>
              </div>
              <CopyButton value={`${window.location.origin}/u/${profile.wallet}`} label={t('profile.copyLink')} doneLabel={t('passport.copied')} display={t('profile.copyLink')} />
            </div>
            {empty && <p className="[font:500_14px_Inter] text-[#A0978A]" data-testid="profile-empty">{t('profile.empty')}</p>}
            {profile.companion && <CompanionSection companion={profile.companion} />}
            {!empty && (
              <section className="flex flex-col gap-4" aria-labelledby="profile-certs">
                <h2 id="profile-certs" className={H2}>{t('profile.certs')}</h2>
                <CertificationsSection items={profile.certifications} />
              </section>
            )}
            {profile.medals.length > 0 && (
              <section className="flex flex-col gap-4" aria-labelledby="profile-medals">
                <h2 id="profile-medals" className={H2}>{t('profile.medals')}</h2>
                <MedalsSection items={profile.medals} />
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
