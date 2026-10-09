import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { courseColor, glyphOf, type Course } from '@/utils/courses';
import { CHIP, FOCUS, MONO_LABEL } from './courseStyles';
import { CourseDots } from './CourseDots';
import { CourseProgressBar } from './CourseProgressBar';

interface Props {
  course: Course;
  /** Shown as an Enroll button when the learner may enroll in this course. */
  enroll?: { pending: boolean; failed: boolean; onEnroll: () => void };
}

const STATE_COLOR = { new: '#A0978A', in_progress: '#F2C66D', done: '#3FD17F' } as const;

export function CourseCard({ course, enroll }: Props) {
  const { t, tText } = useI18n();
  const color = courseColor(course.slug);
  const title = tText(course.title);

  return (
    <article
      data-testid="course-card"
      data-state={course.state}
      data-origin={course.origin}
      className="group relative flex flex-col overflow-hidden rounded-[14px] border border-[#262320] border-b-[5px] bg-[#141210] text-left transition-transform duration-100 hover:-translate-y-1 [&:has(a:active)]:translate-y-[3px]"
      style={{ borderBottomColor: color.c }}
    >
      <span className="box-border flex h-[110px] items-end justify-between border-b-[5px] px-[18px] py-3.5" style={{ background: color.c, color: color.ink, borderBottomColor: color.cd }}>
        <span className="[font:700_46px/1_JetBrains_Mono]">{glyphOf(course.slug)}</span>
        <span className={`${CHIP} bg-[#0A0908] text-[#F4EDE2]`}>{t(`courses.origin.${course.origin}`)}</span>
      </span>
      <span className="flex flex-1 flex-col gap-2.5 px-[18px] pb-[18px] pt-4">
        <span className={MONO_LABEL} style={{ color: STATE_COLOR[course.state] }} data-testid="course-state">
          {t(`courses.state.${course.state}`)}
        </span>
        <Link
          to={`/program/${course.slug}`}
          className={`line-clamp-2 rounded [font:700_28px/1_'Barlow_Condensed'] after:absolute after:inset-0 after:content-[''] ${FOCUS}`}
        >
          {title}
        </Link>
        <span className={`${MONO_LABEL} text-[#A0978A]`}>{t('courses.meta', { units: course.units, lessons: course.lessons, activities: course.activities })}</span>
        <span className="mt-1 flex items-center gap-3">
          <CourseProgressBar done={course.doneActivities} total={course.activities} color={color.cl} slots={10} className="flex-1" />
          <span className={`${MONO_LABEL} text-[#C9BFB0]`}>
            {course.doneActivities}/{course.activities}
          </span>
        </span>
        <span className="mt-auto flex items-center justify-between gap-3 pt-1.5">
          <CourseDots dots={course.dots} color={color} />
          {enroll && (
            <button
              type="button"
              disabled={enroll.pending}
              onClick={enroll.onEnroll}
              data-testid="course-enroll"
              className={`relative z-10 h-10 rounded-lg border-0 border-b-4 px-4 [font:700_18px_'Barlow_Condensed'] transition-transform duration-75 active:translate-y-[3px] active:border-b-[1px] disabled:opacity-60 ${FOCUS}`}
              style={{ background: color.c, color: color.ink, borderBottomColor: color.cd }}
            >
              {enroll.pending ? t('courses.enrolling') : t('courses.enroll')}
            </button>
          )}
        </span>
        {enroll?.failed && (
          <span role="alert" data-testid="course-enroll-error" className={`${MONO_LABEL} text-[#E07A4A]`}>
            {t('courses.enrollError')}
          </span>
        )}
      </span>
    </article>
  );
}
