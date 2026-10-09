import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { courseColor, glyphOf, type Course } from '@/utils/courses';
import { FOCUS } from './courseStyles';
import { CourseDots } from './CourseDots';
import { CourseProgressBar } from './CourseProgressBar';

interface Props {
  course: Course;
  enroll?: { pending: boolean; failed: boolean; onEnroll: () => void };
}

const CTA = `mt-2 inline-flex h-[60px] w-full items-center justify-center rounded-xl border-0 border-b-[6px] [font:700_26px_'Barlow_Condensed'] transition-transform duration-75 active:translate-y-[5px] active:border-b-[1px] disabled:opacity-60 sm:w-[360px] ${FOCUS}`;

/** Hero of the Courses page: the course in progress, built like the dashboard's featured trail. */
export function FeaturedCourse({ course, enroll }: Props) {
  const { t, tText } = useI18n();
  const color = courseColor(course.slug);
  const title = tText(course.title);
  const style = { background: color.c, color: color.ink, borderBottomColor: color.cd };
  const href = course.state === 'in_progress' && course.resumeLessonId ? `/lesson/${course.resumeLessonId}` : `/program/${course.slug}`;
  const label = course.state === 'in_progress' ? t('courses.continue') : course.state === 'done' ? t('courses.review') : t('courses.start');

  return (
    <section className="flex flex-col" data-testid="featured-course">
      <div className="box-border flex min-h-[60px] items-center justify-between gap-3 rounded-t-[14px] border-b-[6px] px-4 py-2 sm:px-6" style={style}>
        <span className="flex min-w-0 items-baseline gap-3.5">
          <span className="hidden [font:700_12px_JetBrains_Mono] tracking-[.1em] md:inline">{course.state === 'in_progress' ? t('courses.badge') : t('courses.badgeNew')}</span>
          <span className="truncate [font:700_32px/1_'Barlow_Condensed'] max-sm:text-[24px]">{title}</span>
        </span>
        <span className="shrink-0 rounded-full bg-[#0A0908] px-3 py-1.5 [font:700_13px_JetBrains_Mono] text-[#F4EDE2]">
          {t('courses.program.days', { done: course.doneLessons, total: course.lessons })}
        </span>
      </div>
      <div className="relative grid items-center gap-6 overflow-hidden rounded-b-[14px] border border-t-0 bg-[#0A0908] p-5 sm:px-9 sm:py-8 xl:grid-cols-[minmax(0,1fr)_320px]" style={{ borderColor: color.c }}>
        <span
          aria-hidden
          className="pointer-events-none absolute -right-3 -top-5 select-none [font:700_240px/0.8_'Barlow_Condensed'] text-transparent max-sm:text-[130px]"
          style={{ WebkitTextStroke: `1.5px ${color.ghost}` }}
        >
          {glyphOf(course.slug)}
        </span>
        <div className="relative flex min-w-0 flex-col gap-3.5">
          <span className="[font:500_13px_JetBrains_Mono]" style={{ color: color.cl }}>
            {t('courses.meta', { units: course.units, lessons: course.lessons, activities: course.activities })}
          </span>
          <span className="[font:700_56px/0.95_'Barlow_Condensed'] max-sm:text-[40px]">{title}</span>
          <span className="flex flex-wrap items-center gap-3">
            <CourseProgressBar done={course.doneActivities} total={course.activities} color={color.cl} className="w-[260px] max-w-full" />
            <span className="[font:500_13px_JetBrains_Mono] text-[#A0978A]">{t('courses.program.activities', { done: course.doneActivities, total: course.activities })}</span>
          </span>
          {enroll ? (
            <button type="button" data-testid="featured-course-cta" disabled={enroll.pending} onClick={enroll.onEnroll} className={CTA} style={style}>
              {enroll.pending ? t('courses.enrolling') : t('courses.enroll')}
            </button>
          ) : (
            <Link to={href} data-testid="featured-course-cta" className={CTA} style={style}>
              {label}
            </Link>
          )}
          {enroll?.failed && (
            <span role="alert" className="[font:500_12px_JetBrains_Mono] text-[#E07A4A]">
              {t('courses.enrollError')}
            </span>
          )}
        </div>
        <div className="relative flex min-w-0 xl:justify-end">
          <CourseDots dots={course.dots} color={color} size="lg" />
        </div>
      </div>
    </section>
  );
}
