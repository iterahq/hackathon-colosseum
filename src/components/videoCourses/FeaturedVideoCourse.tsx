import { Link } from 'react-router-dom';
import { CourseProgressBar } from '@/components/courses/CourseProgressBar';
import { FOCUS } from '@/components/courses/courseStyles';
import { useI18n } from '@/i18n';
import type { VideoCourse } from '@/types/videoCourses';
import { courseColor } from '@/utils/courses';
import { courseStats, formatTotal, courseThumbnail } from '@/utils/videoCourses';
import { CourseThumb } from './CourseThumb';

const CTA = `mt-2 inline-flex h-[60px] w-full items-center justify-center rounded-xl border-0 border-b-[6px] [font:700_26px_'Barlow_Condensed'] transition-transform duration-75 active:translate-y-[5px] active:border-b-[1px] sm:w-[320px] ${FOCUS}`;

/** Hero of the Courses page: the course in progress, else the first one. */
export function FeaturedVideoCourse({ course, progress }: { course: VideoCourse; progress: ReadonlyMap<string, number> }) {
  const { t, locale } = useI18n();
  const color = courseColor(course.slug);
  const stats = courseStats(course, progress);
  const style = { background: '#3FD17F', color: '#0A0908', borderBottomColor: '#1F8A4F' };
  const label = stats.state === 'in_progress' ? t('video.continue') : stats.state === 'done' ? t('video.review') : t('video.start');

  return (
    <section className="flex flex-col" data-testid="featured-course">
      <div className="box-border flex min-h-[48px] items-center justify-between gap-3 rounded-t-[14px] border-b-[6px] px-4 py-2 sm:px-6" style={style}>
        <span className="[font:700_12px_JetBrains_Mono] tracking-[.1em]">{stats.state === 'in_progress' ? t('video.badge') : t('video.badgeNew')}</span>
        <span className="shrink-0 rounded-full bg-[#0A0908] px-3 py-1.5 [font:700_13px_JetBrains_Mono] text-[#F4EDE2]">{t('video.watched', { watched: stats.watched, total: stats.total })}</span>
      </div>
      <div className="grid items-center gap-6 rounded-b-[14px] border border-t-0 bg-[#0A0908] p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-10" style={{ borderColor: color.c }}>
        <div className="flex min-w-0 flex-col gap-3.5">
          <span className="[font:500_13px_JetBrains_Mono]" style={{ color: color.cl }}>
            {t('video.meta', { n: stats.total, duration: formatTotal(stats.durationSeconds) })}
          </span>
          <h2 className="[font:700_56px/0.95_'Barlow_Condensed'] max-sm:text-[40px]">{course.title}</h2>
          <span className="[font:400_16px_Inter] text-[#C9BFB0]">{t('video.with', { name: course.teacherName })}</span>
          <CourseProgressBar done={stats.watched} total={stats.total} color={color.cl} slots={Math.min(Math.max(stats.total, 1), 16)} className="w-[320px] max-w-full" />
          <Link to={`/course/${course.slug}`} data-testid="featured-course-cta" className={CTA} style={style}>
            {label}
          </Link>
        </div>
        <Link to={`/course/${course.slug}`} tabIndex={-1} aria-hidden className="block overflow-hidden rounded-xl border-2 border-b-[6px]" style={{ borderColor: color.cd }}>
          <CourseThumb note={locale === 'en' ? t('video.language.pt') : undefined} title={course.title} slug={course.slug} src={courseThumbnail(course)} play />
        </Link>
      </div>
    </section>
  );
}
