import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CapabilityGraphSection } from '@/components/graph/CapabilityGraphSection';
import { LearnerAvatar } from '@/components/avatar/LearnerAvatar';
import { CertificationsSection, CompanionSection, ExplorerLink, MedalsSection, NoCompanion } from '@/components/passport/ProfileSections';
import { CopyButton } from '@/components/passport/CopyButton';
import { ProfileGift } from '@/components/gift/ProfileGift';
import { FOCUS_BUILD, FOCUS_LIVES_OFF } from '@/config/focus';
import { TERA_BUTTON, TeraNote } from '@/components/tera/TeraNote';
import { HeaderLocale } from '@/components/header/HeaderLocale';
import { useLearnerProfile, useRecheckProfile, useWalletGraph } from '@/hooks/useLearnerProfile';
import { useProgressStory } from '@/hooks/useProgressStory';
import { ChainReadLine } from '@/components/passport/ChainReadLine';
import { staticCapabilities } from '@/services/learnerProfile.service';
import { useI18n } from '@/i18n';
import { shortAddress } from '@/lib/explorer';
import { looksLikeAddress } from '@/utils/credential';
import { profileProgress } from '@/utils/profileProgress';

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
  const { t, locale } = useI18n();
  const story = useProgressStory();
  const valid = looksLikeAddress(wallet);
  const query = useLearnerProfile(valid ? wallet : '', locale);
  const lookup = query.data;
  const profile = lookup?.status === 'ok' ? lookup.profile : null;
  const recheck = useRecheckProfile(valid ? wallet : '', locale);
  const graph = useWalletGraph(valid ? wallet : '', locale);
  const loading = valid && query.isPending;
  // Owned here: the graph is on screen before the profile answers, and a node opened then stays open after.
  const [openNode, setOpenNode] = useState<string | null>(null);
  const capabilities = profile?.capabilities ?? graph.data ?? (valid && lookup?.status !== 'invalid' ? staticCapabilities(locale) : null);
  const empty = profile && !profile.companion && profile.certifications.length === 0 && profile.medals.length === 0;

  return (
    <div className="min-h-screen overflow-x-hidden text-[#F4EDE2]" style={GRID} data-testid="profile-page">
      <header className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-4 sm:px-8">
        <Link to="/" className={`[font:700_28px_'Barlow_Condensed'] tracking-[.02em] text-[#F4EDE2] ${FOCUS}`}>
          ITERA<span className="text-[#3FD17F]">/</span>
        </Link>
        <HeaderLocale size="lg" />
      </header>
      <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-8 px-4 pb-14 pt-4 sm:pt-8">
        {loading && (
          <section className="flex items-center gap-3 rounded-[14px] border border-[#262320] bg-[#141210] p-4 sm:p-5" data-testid="profile-band-loading">
            <span className="h-[72px] w-[72px] shrink-0 animate-pulse rounded-full bg-[#1C1916]" aria-hidden="true" />
            <div className="min-w-0">
              <h1 className="truncate [font:700_34px/1_'Barlow_Condensed'] max-sm:text-[28px]" title={wallet}>{shortAddress(wallet)}</h1>
              <p className="mt-2 [font:500_13px_JetBrains_Mono] text-[#A0978A]">{t('passport.credential.loading')}</p>
            </div>
          </section>
        )}
        {loading && capabilities && <CapabilityGraphSection wallet={wallet} capabilities={capabilities} selected={openNode} onSelect={setOpenNode} />}
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
            <div className="mt-4 flex justify-center">
              <Link to="/" className={`${TERA_BUTTON} w-full max-w-[320px]`} data-testid="profile-invalid-cta">{t('profile.cta')}</Link>
            </div>
          </div>
        )}
        {profile && (
          <>
            <section className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-[14px] border border-[#3FD17F] bg-[#141210] p-4 sm:p-5" data-testid="profile-band">
              <div className="flex min-w-0 items-center gap-3">
                <LearnerAvatar avatar={profile.avatar} size="lg" thumb={false} />
                <div className="min-w-0">
                  <h1 className="truncate [font:700_34px/1_'Barlow_Condensed'] max-sm:text-[28px]" title={profile.wallet}>{shortAddress(profile.wallet)}</h1>
                  <p className="mt-1 [font:500_13px_Inter] text-[#C9BFB0]" data-testid="profile-progress">{profileProgress(profile.certifications, t)}</p>
                  {story.wallet === profile.wallet && story.daysPending > 0 && (
                    <Link to="/passport#held" className={`mt-1 inline-flex min-h-6 items-center rounded [font:500_13px_Inter] text-[#F2C66D] underline-offset-2 hover:underline ${FOCUS}`} data-testid="profile-pending">
                      {t(`profile.pending${story.daysPending === 1 ? '' : '.other'}`, { n: story.daysPending })} →
                    </Link>
                  )}
                  <p className="mt-1 [font:500_13px_JetBrains_Mono] text-[#3FD17F]">{t('profile.verified', { n: profile.verifiedCount })}</p>
                  <ChainReadLine read={lookup?.status === 'ok' ? lookup.read : undefined} ms={0} onRecheck={() => recheck.mutate()} rechecking={recheck.isPending} className="mt-1" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CopyButton value={`${window.location.origin}/u/${profile.wallet}`} label={t('profile.copyLink')} doneLabel={t('passport.copied')} display={t('profile.copyLink')} />
              </div>
              <div className="flex basis-full flex-wrap items-center gap-x-4">
                <ExplorerLink address={profile.wallet} />
                <Link to="/verify#evidence" className={`inline-flex min-h-11 items-center rounded [font:500_12px_JetBrains_Mono] text-[#A0978A] underline-offset-2 hover:text-[#F4EDE2] hover:underline ${FOCUS}`}>
                  {t('verify.link')}
                </Link>
              </div>
            </section>
            {capabilities && <CapabilityGraphSection wallet={profile.wallet} capabilities={capabilities} selected={openNode} onSelect={setOpenNode} />}
            {profile.avatars.length > 0 && (
              <ul className="flex flex-wrap gap-3 rounded-[14px] border border-[#262320] bg-[#141210] p-3" aria-label={t('profile.avatars')} data-testid="profile-avatars">
                {profile.avatars.map((a) => (
                  <li key={`${a.key}-${a.serial ?? ''}`} className="flex items-center gap-2 [font:500_12px_JetBrains_Mono] text-[#C9BFB0]">
                    <img src={a.imageUrl} alt="" className="h-10 w-10 rounded-full bg-[#0A0908] object-cover ring-2 ring-[#262320]" />
                    <span>{a.tierName || a.title}{a.serial ? ` #${a.serial}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
            {!FOCUS_LIVES_OFF && <ProfileGift wallet={profile.wallet} />}
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
                {!FOCUS_BUILD && (profile.companion ? <CompanionSection companion={profile.companion} /> : <NoCompanion />)}
                <section className="flex flex-col gap-4" aria-labelledby="profile-certs">
                  <h2 id="profile-certs" className={H2}>{t('profile.certs')}</h2>
                  <CertificationsSection items={profile.certifications} />
                </section>
                {!FOCUS_BUILD && profile.medals.length > 0 && (
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
