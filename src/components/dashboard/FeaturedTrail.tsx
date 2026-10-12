import { useI18n } from '@/i18n';
import type { Trail } from '@/types/trailDashboard';
import { barFill, colorOfTrail, currentDayOf, dayName, programLabel, trailName } from '@/utils/trailDashboard';
import { FeaturedPath } from './FeaturedPath';
import { countOf } from '@/utils/plural';

interface Props {
  trail: Trail;
  onOpenLesson: (lessonId: string) => void;
  onOpenTrail: (trail: Trail) => void;
}

export function FeaturedTrail({ trail, onOpenLesson, onOpenTrail }: Props) {
  const { t, tText } = useI18n();
  const color = colorOfTrail(trail);
  const current = currentDayOf(trail);
  const currentIndex = current ? trail.days.indexOf(current) : 0;
  const fill = barFill(trail.doneActivities, trail.totalActivities);
  const badge = trail.status === 'fresh' ? t('dash.hero.badgeFresh') : t('dash.hero.badge');
  const name = tText(trailName(trail.title));
  const ghost = String(currentIndex + 1).padStart(2, '0');
  const fresh = trail.status === 'fresh';

  return (
    <section className="flex flex-col" data-testid="featured-trail">
      <div
        className="box-border flex min-h-[60px] items-center justify-between gap-3 rounded-t-[14px] border-b-[6px] px-4 py-2 sm:px-6"
        style={{ background: color.c, color: color.ink, borderBottomColor: color.cd }}
      >
        <span className="flex min-w-0 items-baseline gap-3.5">
          <span className="hidden [font:700_12px_JetBrains_Mono] tracking-[.1em] md:inline">{badge}</span>
          <span className="truncate [font:700_32px/1_'Barlow_Condensed'] max-sm:text-[24px]">
            {name} · {programLabel(tText(trail.programTitle))}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-[#0A0908] px-3 py-1.5 [font:700_13px_JetBrains_Mono] text-[#F4EDE2]">
          {t('dash.hero.days', { done: trail.doneDays, total: trail.days.length })}
        </span>
      </div>
      <div
        className="relative grid items-center gap-6 overflow-hidden rounded-b-[14px] border border-t-0 bg-[#0A0908] p-5 sm:px-9 sm:py-8 xl:grid-cols-[420px_minmax(0,1fr)] xl:gap-10"
        style={{ borderColor: color.c }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-7 right-6 hidden select-none [font:700_220px/0.8_'Barlow_Condensed'] text-transparent xl:block"
          style={{ WebkitTextStroke: `1.5px ${color.ghost}`, opacity: 0.55 }}
        >
          {ghost}
        </span>
        <div className="relative flex min-w-0 flex-col gap-3.5">
          {current && (
            <span className="[font:500_13px_JetBrains_Mono]" style={{ color: color.cl }}>
              {t('dash.hero.today', { day: String(currentIndex + 1).padStart(2, '0'), total: trail.days.length })}
            </span>
          )}
          <span className="[font:700_56px/0.95_'Barlow_Condensed'] max-sm:text-[40px]">{current ? tText(dayName(current.title)) : name}</span>
          <span className="flex flex-wrap items-center gap-3">
            <span className="flex w-[260px] max-w-full gap-1">
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} className="h-1.5 flex-1 rounded-sm" style={{ background: i < fill ? color.cl : '#262320' }} />
              ))}
            </span>
            <span className="[font:500_13px_JetBrains_Mono] text-[#A0978A]">
              {fresh && current
                ? t('dash.hero.freshToday', { days: countOf(t, trail.days.length, 'day'), activities: countOf(t, current.total, 'activity') })
                : t('dash.hero.activities', { done: trail.doneActivities, total: trail.totalActivities })}
            </span>
          </span>
          <button
            type="button"
            data-testid="featured-continue"
            onClick={() => onOpenTrail(trail)}
            className="mt-2 h-[60px] w-full rounded-xl border-0 border-b-[6px] [font:700_26px_'Barlow_Condensed'] transition-transform duration-75 active:translate-y-[5px] active:border-b-[1px] sm:w-[360px]"
            style={{ background: color.c, color: color.ink, borderBottomColor: color.cd }}
          >
            {fresh ? t('dash.trail.start') : t('dash.hero.continue')}
          </button>
        </div>
        <div className="relative">
          <FeaturedPath trail={trail} color={color} onOpenDay={onOpenLesson} />
        </div>
      </div>
    </section>
  );
}
