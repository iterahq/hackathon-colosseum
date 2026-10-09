import { Check, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';
import type { TrailColor, TrailDay } from '@/types/trailDashboard';
import { dayName } from '@/utils/trailDashboard';
import { FOCUS } from './courseStyles';

interface Props {
  day: TrailDay;
  number: number;
  color: TrailColor;
  /** True while the whole trail waits for the previous one. */
  trailLocked: boolean;
}

const ROW = 'flex min-h-[60px] items-center gap-4 rounded-xl border px-3.5 py-2.5';

/** One day (lesson) of a trail: a link when open, a plain locked row otherwise. */
export function ProgramDayRow({ day, number, color, trailLocked }: Props) {
  const { t, tText } = useI18n();
  const state = day.state === 'upcoming' ? 'locked' : day.state;
  const open = state !== 'locked';
  const lit = open;

  const body = (
    <>
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 [font:700_14px_JetBrains_Mono]"
        style={{ background: lit ? color.c : '#1C1916', borderColor: lit ? color.cd : '#2E2A25', color: lit ? color.ink : '#8A8276' }}
      >
        {state === 'done' ? <Check className="h-4 w-4" strokeWidth={3} /> : state === 'locked' ? <Lock className="h-3.5 w-3.5" /> : number}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="[font:500_11px_JetBrains_Mono] text-[#A0978A]">{t('dash.day', { n: number })}</span>
        <span className="truncate [font:700_22px/1.1_'Barlow_Condensed']">{tText(dayName(day.title))}</span>
        {state === 'locked' && !trailLocked && (
          <span className="[font:400_12px_Inter] text-[#A0978A]">{t('courses.program.dayLocked', { n: number - 1 })}</span>
        )}
      </span>
      <span className="shrink-0 [font:500_12px_JetBrains_Mono]" style={{ color: state === 'current' ? color.cl : '#A0978A' }}>
        {state === 'locked' ? t('courses.program.dayActivities', { n: day.total }) : `${day.done}/${day.total}`}
      </span>
    </>
  );

  if (!open) {
    return (
      <li>
        <div data-testid="tree-node-locked" aria-disabled="true" className={`${ROW} border-[#262320] bg-[#0F0D0B] opacity-70`}>
          {body}
        </div>
      </li>
    );
  }
  return (
    <li>
      <Link
        to={`/lesson/${day.id}`}
        data-testid={`tree-node-${state}`}
        className={`${ROW} text-[#F4EDE2] transition-transform duration-75 active:translate-y-[2px] ${FOCUS} ${state === 'current' ? 'bg-[#1C1916]' : 'border-[#262320] bg-[#141210] hover:border-[#A0978A]'}`}
        style={state === 'current' ? { borderColor: color.c } : undefined}
      >
        {body}
      </Link>
    </li>
  );
}
