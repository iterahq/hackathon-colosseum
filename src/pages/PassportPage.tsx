import { useNavigate } from 'react-router-dom';
import { DashboardTopBar } from '@/components/dashboard/DashboardTopBar';
import '@/components/dashboard/dashboard.css';
import { PassportGraph } from '@/components/graph/PassportGraph';
import { LinkWalletButton } from '@/components/wallet/LinkWalletButton';
import { TeraLoader } from '@/components/tera/TeraLoader';
import { CopyButton } from '@/components/passport/CopyButton';
import { MedalShelf } from '@/components/passport/MedalShelf';
import { PassportFullCard } from '@/components/passport/PassportFullCard';
import { PassportHero } from '@/components/passport/PassportHero';
import { PassportPage as Page } from '@/components/passport/PassportPage';
import { pageColor } from '@/components/passport/pageVariant';
import { useUserStats } from '@/hooks/useContent';
import { usePassportView } from '@/hooks/usePassportView';
import { useI18n } from '@/i18n';
import { isGold } from '@/utils/passport';
import { TRAIL_COLORS } from '@/utils/trailDashboard';

const GRID = {
  backgroundColor: '#0A0908',
  backgroundImage: 'linear-gradient(#15130F 1px,transparent 1px),linear-gradient(90deg,#15130F 1px,transparent 1px)',
  backgroundSize: '26px 26px',
} as const;

const BTN =
  'inline-flex h-[60px] items-center justify-center rounded-xl border-0 border-b-[6px] border-b-[#1F8A4F] bg-[#3FD17F] px-6 [font:700_24px_\'Barlow_Condensed\'] text-[#0A0908] transition-transform duration-75 active:translate-y-[5px] active:border-b-[1px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4EDE2]';

const H2 = "[font:700_32px_'Barlow_Condensed']";

/** /passport: every page of Tera's passport, the medals and the public links. */
export default function PassportPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const stats = useUserStats();
  const view = usePassportView();
  const started = view.pages.filter((p) => p.daysDone > 0).sort((a, b) => Number(isGold(b)) - Number(isGold(a)));
  const first = view.pages.find((p) => p.trailId === view.featuredId) ?? view.pages.find((p) => !p.locked) ?? null;
  const shared = started.filter((p) => p.mintStatus === 'minted' && p.assetAddress);
  const color = first ? pageColor(first) : TRAIL_COLORS[1];

  return (
    <div className="dash-root min-h-screen overflow-x-hidden text-[#F4EDE2]" style={GRID}>
      <DashboardTopBar xp={stats.data?.totalXp ?? null} achievements={view.isPending ? null : view.earnedCount} activities={stats.data?.completedActivities ?? null} streak={stats.data?.streakDays ?? null} />
      <main className="mx-auto flex max-w-[1100px] flex-col gap-10 px-4 pb-14 pt-6 sm:px-8 xl:pt-10">
        <PassportHero wallet={view.walletAddress} pages={view.totals.pages} stamps={view.totals.stamps} medals={view.totals.medals} />
        {!view.walletAddress && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#262320] bg-[#141210] p-4" data-testid="passport-no-wallet">
            <span className="[font:500_14px_Inter] text-[#C9BFB0]">{t('passport.noWallet.banner')}</span>
            <LinkWalletButton className={`${BTN} !h-11 !border-b-[4px] !px-4 !text-[18px]`} />
            <span className="basis-full [font:400_12px/1.4_Inter] text-[#A0978A]">{t('wallet.link.hint')}</span>
          </div>
        )}
        {view.isError && (
          <button type="button" onClick={view.refetch} className={BTN}>
            {t('passport.retry')}
          </button>
        )}
        <PassportGraph wallet={view.walletAddress} />
        <section className="flex flex-col gap-5" aria-labelledby="passport-pages">
          <h2 id="passport-pages" className={H2}>
            {t('passport.pages')}
          </h2>
          {view.isPending ? (
            <TeraLoader size="md" label={t('passport.credential.loading')} data-testid="passport-loading" />
          ) : started.length === 0 ? (
            <div className="flex flex-col items-center gap-4 text-center" data-testid="passport-empty">
              {first && <Page title={first.trailTitle} color={pageColor(first)} total={first.totalDays} done={0} variant="fresh" pulseNext />}
              <p className="[font:500_14px_JetBrains_Mono] text-[#A0978A]">{t('passport.empty.text')}</p>
              <button type="button" onClick={() => navigate('/')} className={BTN}>
                {t('passport.empty.cta')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {started.map((p) => (
                <PassportFullCard key={p.trailId} page={p} />
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
        {shared.length > 0 && (
          <section className="flex flex-col gap-3" aria-labelledby="passport-share">
            <h2 id="passport-share" className={H2}>
              {t('passport.share')}
            </h2>
            <div className="flex flex-wrap gap-3">
              {shared.map((p) => (
                <CopyButton key={p.trailId} value={`${window.location.origin}/c/${p.assetAddress}`} label={`${t('passport.copyLink')} · ${p.trailTitle}`} doneLabel={t('passport.copied')} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
