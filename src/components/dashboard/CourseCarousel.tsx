import { useRef } from 'react';
import type { CatalogProgram } from '@/types/catalog';
import { useI18n } from '@/i18n';
import { TRAIL_COLORS } from '@/utils/trailDashboard';
import { countOf } from '@/utils/plural';

interface Props {
  courses: CatalogProgram[];
  onOpen: (course: CatalogProgram) => void;
}

const NEW_WINDOW_MS = 30 * 86_400_000;
const CARD = 320;

const NAV_BUTTON = 'h-11 w-11 rounded-full border border-[#2E2A25] bg-[#141210] [font:700_16px_JetBrains_Mono] text-[#F4EDE2] hover:border-[#A0978A]';

export function CourseCarousel({ courses, onOpen }: Props) {
  const { t, tText } = useI18n();
  const track = useRef<HTMLDivElement>(null);
  const scroll = (left: number) => track.current?.scrollBy({ left, behavior: 'smooth' });
  if (courses.length === 0) return null;

  return (
    <section className="flex min-w-0 flex-col gap-4" data-testid="course-carousel">
      <div className="flex items-center justify-between">
        <h2 className="[font:700_32px_'Barlow_Condensed']">{t('dash.courses.title')}</h2>
        <span className="flex gap-2">
          <button type="button" aria-label={t('dash.courses.prev')} onClick={() => scroll(-CARD)} className={NAV_BUTTON}>
            ←
          </button>
          <button type="button" aria-label={t('dash.courses.next')} onClick={() => scroll(CARD)} className={NAV_BUTTON}>
            →
          </button>
        </span>
      </div>
      <div ref={track} className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth">
        {courses.map((course, i) => {
          const color = TRAIL_COLORS[(i + 1) % TRAIL_COLORS.length];
          const isNew = Date.now() - Date.parse(course.createdAt) < NEW_WINDOW_MS;
          return (
            <button
              key={course.id}
              type="button"
              data-testid="course-card"
              onClick={() => onOpen(course)}
              className="flex w-[300px] flex-none snap-start flex-col overflow-hidden rounded-[14px] border border-[#262320] bg-[#141210] p-0 text-left text-[#F4EDE2]"
            >
              <span
                className="box-border flex h-[120px] items-end justify-between border-b-[5px] px-[18px] py-3.5"
                style={{ background: color.c, color: color.ink, borderBottomColor: color.cd }}
              >
                <span className="[font:700_46px/1_JetBrains_Mono]">{course.slug.slice(0, 3)}</span>
                {isNew && <span className="rounded-full bg-[#0A0908] px-[9px] py-1 [font:700_11px_JetBrains_Mono] text-[#F4EDE2]">{t('dash.courses.new')}</span>}
              </span>
              <span className="flex flex-col gap-1.5 px-[18px] pb-[18px] pt-4">
                <span className="line-clamp-2 [font:700_24px/1_'Barlow_Condensed']">{tText(course.title)}</span>
                <span className="[font:500_12px_JetBrains_Mono] text-[#A0978A]">
                  {t('dash.courses.meta', { lessons: countOf(t, course.lessonCount, 'lesson'), activities: countOf(t, course.activityCount, 'activity') })}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
