import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';
import type { ProgramDetail } from '@/types/content';
import type { Trail } from '@/types/trailDashboard';
import { courseColor, glyphOf } from '@/utils/courses';
import { programTotals } from '@/utils/coursesProgram';
import { FOCUS } from './courseStyles';
import { CourseProgressBar } from './CourseProgressBar';

interface Props {
  program: ProgramDetail;
  trails: Trail[];
}

/** Hero of the program page: accent color, title, meta, overall progress and the way back into the course. */
export function ProgramHero({ program, trails }: Props) {
  const { t, tText } = useI18n();
  const color = courseColor(program.slug);
  const totals = programTotals(trails);
  const current = trails.find((tr) => tr.status !== 'locked' && tr.status !== 'done')?.days.find((d) => d.state === 'current');
  const finished = totals.lessons > 0 && totals.doneLessons === totals.lessons;
  const style = { background: '#3FD17F', color: '#0A0908', borderBottomColor: '#1F8A4F' };

  return (
    <section className="flex flex-col" data-testid="program-hero">
      <div className="box-border flex min-h-[60px] items-center justify-between gap-3 rounded-t-[14px] border-b-[6px] px-4 py-2 sm:px-6" style={style}>
        <Link to="/catalog" className={`rounded [font:700_13px_JetBrains_Mono] ${FOCUS}`}>
          ← {t('courses.program.back')}
        </Link>
        <span className="rounded-full bg-[#0A0908] px-3 py-1.5 [font:700_13px_JetBrains_Mono] text-[#F4EDE2]">
          {t('courses.program.days', { done: totals.doneLessons, total: totals.lessons })}
        </span>
      </div>
      <div className="relative flex flex-col gap-3.5 overflow-hidden rounded-b-[14px] border border-t-0 bg-[#0A0908] p-5 sm:px-9 sm:py-8" style={{ borderColor: color.c }}>
        <span aria-hidden className="pointer-events-none absolute -right-3 -top-5 select-none [font:700_240px/0.8_'Barlow_Condensed'] text-transparent max-sm:text-[130px]" style={{ WebkitTextStroke: `1.5px ${color.ghost}` }}>
          {glyphOf(program.slug)}
        </span>
        <span className="relative [font:500_13px_JetBrains_Mono]" style={{ color: color.cl }} data-testid="program-counts">
          {t('courses.program.prompt', { units: totals.units, lessons: totals.lessons })}
        </span>
        <h1 className="relative [font:700_64px/0.95_'Barlow_Condensed'] max-sm:text-[44px]">{tText(program.title)}</h1>
        <span className="relative flex flex-wrap items-center gap-3">
          <CourseProgressBar done={totals.doneActivities} total={totals.activities} color={color.cl} className="w-[260px] max-w-full" />
          <span className="[font:500_13px_JetBrains_Mono] text-[#A0978A]">{t('courses.program.activities', { done: totals.doneActivities, total: totals.activities })}</span>
        </span>
        {current && (
          <Link
            to={`/lesson/${current.id}`}
            data-testid="program-continue"
            className={`relative mt-2 inline-flex h-[60px] w-full items-center justify-center rounded-xl border-0 border-b-[6px] [font:700_26px_'Barlow_Condensed'] transition-transform duration-75 active:translate-y-[5px] active:border-b-[1px] sm:w-[360px] ${FOCUS}`}
            style={style}
          >
            {totals.doneActivities > 0 ? t('courses.continue') : t('courses.start')}
          </Link>
        )}
        {finished && <span className="relative [font:700_13px_JetBrains_Mono] text-[#3FD17F]">✓ {t('dash.trail.done')}</span>}
      </div>
    </section>
  );
}
