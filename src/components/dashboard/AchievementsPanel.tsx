import { Link } from 'react-router-dom';
import { TeraNote } from '@/components/tera/TeraNote';
import { MedalShelf } from '@/components/passport/MedalShelf';
import { PassportMiniCard } from '@/components/passport/PassportMiniCard';
import { pageColor } from '@/components/passport/pageVariant';
import { useI18n } from '@/i18n';
import type { PassportMedal, PassportPageData } from '@/types/achievements';
import { TRAIL_COLORS } from '@/utils/trailDashboard';
import { countOf } from '@/utils/plural';

interface Props {
  pages: PassportPageData[];
  medals: PassportMedal[];
  stamps: number;
  featuredId: string | null;
  onOpenTrail: (trailId: string) => void;
}

/** "Tera's Passport" on the dashboard: one mini page per trail, then the medal shelf. */
export function AchievementsPanel({ pages, medals, stamps, featuredId, onOpenTrail }: Props) {
  const { t } = useI18n();
  const earnedMedals = medals.filter((m) => m.earned).length;
  const empty = stamps === 0;
  const featured = pages.find((p) => p.trailId === featuredId) ?? pages.find((p) => !p.locked) ?? null;
  const shelfColor = featured ? pageColor(featured) : TRAIL_COLORS[1];

  return (
    <section className="flex min-w-0 flex-col gap-5 rounded-[14px] border border-[#262320] bg-[#141210] px-5 py-6 sm:px-7" data-testid="achievements">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="[font:700_32px_'Barlow_Condensed']">{t('passport.title')}</h2>
        <span className="flex items-baseline gap-4 [font:500_13px_JetBrains_Mono] text-[#A0978A]">
          <span>{t('passport.counts', { stamped: countOf(t, stamps, 'stamp'), medals: countOf(t, earnedMedals, 'medal') })}</span>
          <Link to="/passport" className="inline-flex min-h-[44px] items-center text-[#3FD17F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]">
            {t('passport.seeAll')}
          </Link>
        </span>
      </div>
      <div className="flex snap-x gap-4 overflow-x-auto pb-2" data-testid="passport-row">
        {empty && featured ? (
          <>
            <PassportMiniCard page={featured} pulseNext caption={t('passport.firstStampNear')} onOpen={onOpenTrail} />
            <div className="min-w-0 self-center" data-testid="achievements-tera">
              <TeraNote mood="neutral" size="bubble" title={t('passport.empty.text')} className="!items-start !pt-4 !text-left" />
            </div>
          </>
        ) : (
          pages.map((p) => <PassportMiniCard key={p.trailId} page={p} onOpen={onOpenTrail} />)
        )}
      </div>
      <MedalShelf medals={medals} color={shelfColor} />
    </section>
  );
}
