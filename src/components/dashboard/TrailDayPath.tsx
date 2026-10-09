import { useI18n } from '@/i18n';
import type { Trail, TrailColor } from '@/types/trailDashboard';
import { dayName } from '@/utils/trailDashboard';

const NODE = 'grid h-8 w-8 shrink-0 place-items-center rounded-full [font:700_13px_JetBrains_Mono]';

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

/** The days of a trail as a horizontal path: done, current and upcoming nodes; titles show from `sm` up and as tooltips below. */
export function TrailDayPath({ trail, muted, color }: { trail: Trail; muted: boolean; color: TrailColor }) {
  const { t, tText } = useI18n();
  return (
    <ol className="m-0 flex list-none p-0" data-testid="trail-days">
      {trail.days.map((day, i) => {
        const title = tText(dayName(day.title));
        const last = i === trail.days.length - 1;
        const done = day.state === 'done';
        const current = day.state === 'current';
        const cls = done
          ? ''
          : current
            ? 'border-2'
            : 'border border-[#2E2A25] bg-[#1C1916] text-[#8A8276]';
        const style = done ? { background: color.c, color: color.ink } : current ? { borderColor: color.c, background: color.cs, color: color.cl } : undefined;
        return (
          <li key={day.id} data-state={day.state} title={`${t('dash.trail.dayN', { n: i + 1 })} · ${title}`} className="relative flex min-w-0 flex-1 flex-col items-center gap-2">
            {!last && <span aria-hidden className={`absolute left-1/2 top-[15px] h-0.5 w-full ${done ? '' : 'bg-[#2E2A25]'}`} style={done ? { background: color.c } : undefined} />}
            <span className={`relative ${NODE} ${cls} ${muted ? 'opacity-60' : ''}`} style={style}>{done ? <Check /> : i + 1}</span>
            <span className={`line-clamp-2 hidden max-w-[130px] px-1 text-center [font:400_12px/1.25_Inter] ${muted ? "" : "sm:block"} ${current ? 'text-[#F4EDE2]' : 'text-[#A0978A]'}`}>{title}</span>
            <span className="sr-only">{`${t('dash.trail.dayN', { n: i + 1 })} · ${title}`}</span>
          </li>
        );
      })}
    </ol>
  );
}
