import { useState } from 'react';
import { CoursesShell } from '@/components/courses/CoursesShell';
import { FeaturedVideoCourse } from '@/components/videoCourses/FeaturedVideoCourse';
import { VideoCourseCard } from '@/components/videoCourses/VideoCourseCard';
import { VideoCourseFilters } from '@/components/videoCourses/VideoCourseFilters';
import { CatalogSkeleton, VideoState } from '@/components/videoCourses/VideoStates';
import { useVideoCourses } from '@/hooks/useVideoCourses';
import { useI18n } from '@/i18n';
import type { VideoCourseFilter } from '@/types/videoCourses';
import { countByFilter, filterCourses, pickFeatured, sortCourses, thumbnailsOf } from '@/utils/videoCourses';

/** The "Cursos" tab: a library of video courses, each with a teacher. */
export default function CatalogRoute() {
  const { t } = useI18n();
  const { courses, progress, isPending, isError, refetch } = useVideoCourses();
  const [filter, setFilter] = useState<VideoCourseFilter>('all');

  const ordered = sortCourses(courses);
  const featured = pickFeatured(ordered, progress);
  const shown = filterCourses(ordered, progress, filter);
  const thumbnails = thumbnailsOf(ordered);

  return (
    <CoursesShell>
      <header className="flex flex-col gap-2">
        <span className="[font:500_13px_JetBrains_Mono] text-[#3FD17F]">{t('video.prompt', { n: courses.length })}</span>
        <h1 className="[font:700_64px/0.95_'Barlow_Condensed'] max-sm:text-[48px]">{t('video.title')}</h1>
        <p className="max-w-[56ch] [font:400_16px/1.5_Inter] text-[#A0978A]">{t('video.sub')}</p>
      </header>
      {isPending && <CatalogSkeleton />}
      {!isPending && isError && <VideoState kind="error" onAction={refetch} />}
      {!isPending && !isError && !featured && <VideoState kind="empty" onAction={refetch} />}
      {!isPending && !isError && featured && (
        <>
          <FeaturedVideoCourse course={featured} progress={progress} />
          <VideoCourseFilters value={filter} counts={countByFilter(ordered, progress)} onChange={setFilter} />
          {shown.length === 0 ? (
            <VideoState kind="filtered" onAction={() => setFilter('all')} />
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4" data-testid="courses-grid">
              {shown.map((course) => (
                <VideoCourseCard key={course.id} course={course} progress={progress} thumbnail={thumbnails.get(course.id) ?? null} />
              ))}
            </div>
          )}
        </>
      )}
    </CoursesShell>
  );
}
