import { Link } from 'react-router-dom';
import { DashboardTopBar } from '@/components/dashboard/DashboardTopBar';
import '@/components/dashboard/dashboard.css';
import { LinkWalletButton } from '@/components/wallet/LinkWalletButton';
import { TeraLoader } from '@/components/tera/TeraLoader';
import { CertificationCard } from '@/components/passport/CertificationCard';
import { MedalShelf } from '@/components/passport/MedalShelf';
import { PassportHero } from '@/components/passport/PassportHero';
import { HeldStampNotice } from '@/components/passport/HeldStampNotice';
import { pageColor } from '@/components/passport/pageVariant';
import { useUserStats } from '@/hooks/useContent';
import { usePassportView } from '@/hooks/usePassportView';
import { useI18n } from '@/i18n';
import { TRAIL_COLORS } from '@/utils/trailDashboard';

const GRID = {
  backgroundColor: '#0A0908',
  backgroundImage: 'linear-gradient(#15130F 1px,transparent 1px),linear-gradient(90deg,#15130F 1px,transparent 1px)',
  backgroundSize: '26px 26px',
} as const;

const BTN =
  'inline-flex h-[60px] items-center justify-center rounded-xl border-0 border-b-[6px] border-b-[#1F8A4F] bg-[#3FD17F] px-6 [font:700_24px_\'Barlow_Condensed\'] text-[#0A0908] transition-transform duration-75 active:translate-y-[5px] active:border-b-[1px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4EDE2]';

const H2 = "[font:700_32px_'Barlow_Condensed']";

/**
 * /certifications (and /passport, its old name): the list. One card per certification of the program, grey until
 * started, then the medals. A card opens that certification's own page: the certificate, its claims map and the
 * link to the chain. Teras live in the World.
 */
export default function PassportPage() {
  const { t } = useI18n();
  const stats = useUserStats();
  const view = usePassportView();
  const first = view.pages.find((p) => p.trailId === view.featuredId) ?? view.pages.find((p) => !p.locked) ?? null;
  const color = first ? pageColor(first) : TRAIL_COLORS[1];
  const pending = view.isPending ? 0 : view.totals.pending;
  const heldLesson = view.heldLessonId;

  return (
    <div className="dash-root min-h-screen overflow-x-hidden text-[#F4EDE2]" style={GRID}>
      <DashboardTopBar xp={stats.data?.totalXp ?? null} achievements={view.isPending ? null : view.earnedCount} activities={stats.data?.completedActivities ?? null} streak={stats.data?.streakDays ?? null} />
      <main className="mx-auto flex max-w-[1100px] flex-col gap-10 px-4 pb-24 pt-6 sm:px-8 lg:pb-14 xl:pt-10">
        <PassportHero wallet={view.walletAddress} pages={view.totals.pages} stamps={view.totals.stamps} pending={pending} medals={view.totals.medals} />
        {view.walletAddress && pending > 0 && (
          <HeldStampNotice
            id="held"
            title={t(pending === 1 ? 'passport.held.title' : 'passport.held.title.other', { n: pending })}
            body={t('passport.held.body')}
            action={heldLesson ? <Link to={`/lesson/${heldLesson}`} className="inline-flex min-h-11 items-center self-start rounded [font:700_13px_JetBrains_Mono] text-[#F2C66D] underline-offset-2 hover:underline" data-testid="held-stamp-open">{t('passport.held.lesson')} →</Link> : undefined}
            testId="passport-held"
          />
        )}
        {!view.walletAddress && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#262320] bg-[#141210] p-4" data-testid="passport-no-wallet">
            <span className="[font:500_14px_Inter] text-[#C9BFB0]">{t('passport.noWallet.banner')}</span>
            <LinkWalletButton className={`${BTN} !h-11 !border-b-[4px] !px-4 !text-[18px]`} />
          </div>
        )}
        {view.isError && (
          <button type="button" onClick={view.refetch} className={`${BTN} self-start`}>
            {t('passport.retry')}
          </button>
        )}
        <section className="flex flex-col gap-5" aria-labelledby="passport-pages">
          <h2 id="passport-pages" className={H2}>
            {t('passport.pages')}
          </h2>
          {view.isPending ? (
            <TeraLoader size="md" label={t('passport.credential.loading')} data-testid="passport-loading" />
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="certification-list">
              {view.pages.map((p) => (
                <CertificationCard key={p.trailId} page={p} />
              ))}
            </div>
          )}
        </section>
        <section className="flex flex-col gap-3" aria-labelledby="passport-medals">
          <h2 id="passport-medals" className={H2}>
            {t('passport.medals')}
          </h2>
          <MedalShelf medals={view.medals} color={color} size={96} />
        </section>
      </main>
    </div>
  );
}
