import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { FOCUS, MONO_LABEL } from '@/components/courses/courseStyles';
import { CourseThumb } from '@/components/videoCourses/CourseThumb';
import { useI18n } from '@/i18n';
import type { VideoCourse } from '@/types/videoCourses';
import { courseColor } from '@/utils/courses';
import { formatTotal, sortCourses, uniqueCourses, thumbnailsOf } from '@/utils/videoCourses';

interface Props {
  courses: readonly VideoCourse[];
}

const CARD = 320;

const NAV_BUTTON = 'h-11 w-11 rounded-full border border-[#2E2A25] bg-[#141210] [font:700_16px_JetBrains_Mono] text-[#F4EDE2] hover:border-[#A0978A] max-sm:hidden';

/** Dashboard teaser of the video course library: every card opens its course, "Ver todos" opens the Cursos tab. */
export function CourseCarousel({ courses }: Props) {
  const { t, locale } = useI18n();
  const track = useRef<HTMLDivElement>(null);
  const scroll = (left: number) => track.current?.scrollBy({ left, behavior: 'smooth' });
  if (courses.length === 0) return null;
  const ordered = sortCourses(uniqueCourses(courses));
  const thumbnails = thumbnailsOf(ordered);

  return (
    <section className="flex min-w-0 flex-col gap-4" data-testid="course-carousel">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="[font:700_32px_'Barlow_Condensed'] max-sm:text-[26px]">{t('dash.courses.title')}</h2>
          <p className="[font:400_13px/1.4_Inter] text-[#A0978A]" data-testid="course-carousel-extra">{t('dash.courses.extra')}</p>
        </div>
        <span className="flex flex-none items-center gap-2">
          <Link to="/catalog" data-testid="course-carousel-all" className={`rounded px-1 py-2 [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline ${FOCUS}`}>
            {t('dash.courses.seeAll')}
          </Link>
          <button type="button" aria-label={t('dash.courses.prev')} onClick={() => scroll(-CARD)} className={NAV_BUTTON}>
            ←
          </button>
          <button type="button" aria-label={t('dash.courses.next')} onClick={() => scroll(CARD)} className={NAV_BUTTON}>
            →
          </button>
        </span>
      </div>
      <div ref={track} className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2">
        {ordered.map((course, index) => {
          const seconds = course.lessons.reduce((n, l) => n + l.durationSeconds, 0);
          return (
            <Link
              key={course.id}
              to={`/course/${course.slug}`}
              data-testid="course-card"
              className={`flex w-[300px] flex-none snap-start flex-col overflow-hidden rounded-[14px] border border-[#262320] border-b-[5px] bg-[#141210] text-left text-[#F4EDE2] transition-transform duration-100 hover:-translate-y-1 active:translate-y-[3px] max-sm:w-[260px] ${FOCUS}`}
              style={{ borderBottomColor: courseColor(course.slug).c }}
            >
              <CourseThumb note={locale === 'en' ? t('video.language.pt') : undefined} title={course.title} slug={course.slug} src={thumbnails.get(course.id) ?? null} eager={index < 4} />
              <span className="flex flex-col gap-1.5 px-[18px] pb-[18px] pt-4">
                <span className="line-clamp-2 min-h-[48px] [font:700_24px/1_'Barlow_Condensed']">{course.title}</span>
                <span className="truncate [font:400_13px_Inter] text-[#C9BFB0]">{course.teacherName}</span>
                <span className={`${MONO_LABEL} text-[#A0978A]`}>{t('video.meta', { n: course.lessons.length, duration: formatTotal(seconds) })}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
