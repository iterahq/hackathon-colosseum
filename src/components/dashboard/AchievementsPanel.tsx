import { Link } from 'react-router-dom';
import { FOCUS_BUILD } from '@/config/focus';
import { MedalShelf } from '@/components/passport/MedalShelf';
import { OnChainMark } from '@/components/passport/OnChainMark';
import { PassportArt } from '@/components/passport/PassportArt';
import { pageArtSrc, pageColor, pageVariant } from '@/components/passport/pageVariant';
import { useI18n } from '@/i18n';
import type { PassportMedal, PassportPageData } from '@/types/achievements';
import { PRIMARY_COLOR } from '@/utils/trailDashboard';
import { countOf } from '@/utils/plural';
import { isGold } from '@/utils/passport';

interface Props {
  pages: PassportPageData[];
  medals: PassportMedal[];
  stamps: number;
  onOpenTrail: (trailId: string) => void;
}

function Thumb({ page, onOpen }: { page: PassportPageData; onOpen: (trailId: string) => void }) {
  const { t, locale } = useI18n();
  const variant = pageVariant(page);
  const minted = page.mintStatus === 'minted' && Boolean(page.assetAddress || page.txSignature);
  const art = <PassportArt src={pageArtSrc(page, locale)} title={page.trailTitle} color={pageColor(page)} total={page.totalDays} done={page.daysDone} variant={variant} width={96} ribbon={t('passport.ribbon')} />;
  return (
    <div data-testid="passport-card" data-variant={variant} className="flex w-24 flex-col items-start gap-1.5 [font:500_11px_JetBrains_Mono]">
      {variant === 'locked' ? (
        art
      ) : (
        <button type="button" onClick={() => onOpen(page.trailId)} className="rounded-xl bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3FD17F]">
          {art}
        </button>
      )}
      <span style={{ color: variant === 'gold' ? '#F2C66D' : '#C9BFB0' }}>{variant === 'locked' ? '🔒' : t('passport.days', { done: page.daysDone, total: page.totalDays })}</span>
      {minted && <OnChainMark txSignature={page.txSignature} assetAddress={page.assetAddress} />}
    </div>
  );
}

/** "Tera's Certifications", compact: one thumbnail per trail, the counts, a single-row medal shelf. */
export function AchievementsPanel({ pages, medals, stamps, onOpenTrail }: Props) {
  const { t } = useI18n();
  const earnedMedals = medals.filter((m) => m.earned).length;
  const completed = pages.filter(isGold).length;

  return (
    <section className={`flex min-w-0 flex-col gap-5 rounded-[14px] border border-[#262320] bg-[#141210] px-5 py-[22px] ${FOCUS_BUILD ? '' : 'flex-1 justify-between'}`} data-testid="achievements">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="m-0 [font:700_26px_'Barlow_Condensed']">{t('passport.title')}</h2>
          <span className="[font:500_13px_JetBrains_Mono] text-[#C9BFB0]">{t('dash.certs.progress', { n: completed, total: pages.length })}</span>
        </div>
        <Link to="/passport" className="inline-flex min-h-[44px] items-center self-start [font:500_13px_JetBrains_Mono] text-[#3FD17F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]">
          {t('passport.seeAll')}
        </Link>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-4" data-testid="passport-row">
        {pages.map((p) => (
          <Thumb key={p.trailId} page={p} onOpen={onOpenTrail} />
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <span className="[font:500_12px_JetBrains_Mono] text-[#A0978A]">{t('passport.counts', { stamped: countOf(t, stamps, 'stamp'), medals: countOf(t, earnedMedals, 'medal') })}</span>
        {!FOCUS_BUILD && <MedalShelf medals={medals} color={PRIMARY_COLOR} size={44} compact />}
      </div>
    </section>
  );
}
