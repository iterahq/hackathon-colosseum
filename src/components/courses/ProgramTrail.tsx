import { Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';
import type { Trail } from '@/types/trailDashboard';
import { colorOfTrail, trailName } from '@/utils/trailDashboard';
import { FOCUS } from './courseStyles';
import { ProgramDayRow } from './ProgramDayRow';

/** One unit of the program as a dashboard trail card: colored strip on top, thick colored bottom border, its days below. */
export function ProgramTrail({ trail, number, highlighted = false }: { trail: Trail; number: number; highlighted?: boolean }) {
  const { t, tText } = useI18n();
  const color = colorOfTrail(trail);
  const locked = trail.status === 'locked';
  const done = trail.status === 'done';
  const accent = locked ? '#A0978A' : color.cl;
  const tag = locked
    ? t('courses.program.unlocksAfter', { name: tText(trailName(trail.unlockedBy ?? trail.title)) })
    : done
      ? t('dash.trail.done')
      : trail.status === 'fresh'
        ? t('dash.trail.fresh')
        : t('dash.trail.inProgress');

  const next = trail.days.find((d) => d.state === 'current');
  const ctaStyle = { background: color.c, color: color.ink, borderBottomColor: color.cd };
  const CTA = `mt-1 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-xl border-0 border-b-[5px] [font:700_22px_'Barlow_Condensed'] transition-transform duration-75 sm:w-[300px] ${FOCUS}`;

  return (
    <section
      id={`trail-${trail.id}`}
      data-highlighted={highlighted}
      data-testid="program-trail"
      data-status={trail.status}
      className="flex scroll-mt-24 flex-col overflow-hidden rounded-[14px] border border-[#262320] border-b-[5px] bg-[#141210] transition-shadow duration-500"
      style={{ borderBottomColor: locked ? '#262320' : color.c, boxShadow: highlighted ? `0 0 0 2px ${color.c}, 0 0 32px ${color.c}66` : undefined }}
    >
      <span className="h-2" style={{ background: locked ? '#262320' : color.c }} />
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-5 pb-3 pt-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="[font:500_12px_JetBrains_Mono]" style={{ color: accent }}>
            {t('courses.program.unit', { n: String(number).padStart(2, '0') })} · {tag}
          </span>
          <h2 className="[font:700_36px/1_'Barlow_Condensed'] max-sm:text-[30px]">{tText(trailName(trail.title))}</h2>
        </div>
        <span className="rounded-full bg-[#0A0908] px-3 py-1.5 [font:700_13px_JetBrains_Mono]" style={{ color: accent }}>
          {t('courses.program.days', { done: trail.doneDays, total: trail.days.length })}
        </span>
      </div>
      {!done && (
        <div className="px-5 pb-3">
          {locked ? (
            <button type="button" disabled aria-disabled data-testid="trail-cta" className={`${CTA} cursor-default border-[#262320] bg-[#1C1916] text-[#A0978A]`}>
              <Lock className="h-4 w-4" /> {t('courses.program.unlocksAfter', { name: tText(trailName(trail.unlockedBy ?? trail.title)) })}
            </button>
          ) : (
            next && (
              <Link to={`/lesson/${next.id}`} data-testid="trail-cta" className={`${CTA} active:translate-y-1 active:border-b-[1px]`} style={ctaStyle}>
                {trail.status === 'fresh' ? t('courses.program.startTrail') : t('courses.program.continueTrail')}
              </Link>
            )
          )}
        </div>
      )}
      <ul className="m-0 flex list-none flex-col gap-2 px-3 pb-4 pl-3">
        {trail.days.map((day, i) => (
          <ProgramDayRow key={day.id} day={day} number={i + 1} color={color} trailLocked={locked} />
        ))}
      </ul>
    </section>
  );
}
