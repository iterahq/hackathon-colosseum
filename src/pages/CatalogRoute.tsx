import { useState } from 'react';
import { CourseFilters } from '@/components/courses/CourseFilters';
import { CoursesGrid } from '@/components/courses/CoursesGrid';
import { CoursesHeader } from '@/components/courses/CoursesHeader';
import { CoursesShell } from '@/components/courses/CoursesShell';
import { CoursesSkeleton, CoursesState } from '@/components/courses/CoursesStates';
import { FeaturedCourse } from '@/components/courses/FeaturedCourse';
import { useCourses } from '@/hooks/useCourses';
import { useCoursesEnroll } from '@/hooks/useCoursesEnroll';
import { countByFilter, filterCourses, pickFeaturedCourse, type CourseFilter } from '@/utils/courses';

/** The "Cursos" tab: the learner's programs and the catalog, in the dashboard's visual language. */
export default function CatalogRoute() {
  const { courses, visitor, isPending, isError, refetch } = useCourses();
  const { states, enrollIn } = useCoursesEnroll();
  const [filter, setFilter] = useState<CourseFilter>('all');

  const featured = pickFeaturedCourse(courses);
  const shown = filterCourses(courses, filter);
  const enrollFor = (course: NonNullable<typeof featured>) =>
    !visitor && !course.enrolled ? { pending: states[course.id]?.pending ?? false, failed: states[course.id]?.failed ?? false, onEnroll: () => void enrollIn(course) } : undefined;

  return (
    <CoursesShell>
      <CoursesHeader count={courses.length} />
      {isPending && <CoursesSkeleton />}
      {!isPending && isError && <CoursesState kind="error" onAction={refetch} />}
      {!isPending && !isError && courses.length === 0 && <CoursesState kind="empty" onAction={refetch} />}
      {!isPending && !isError && featured && (
        <>
          <FeaturedCourse course={featured} enroll={enrollFor(featured)} />
          <CourseFilters value={filter} counts={countByFilter(courses)} onChange={setFilter} />
          {shown.length === 0 ? (
            <CoursesState kind="filtered" onAction={() => setFilter('all')} />
          ) : (
            <CoursesGrid courses={shown} states={states} canEnroll={!visitor} onEnroll={(c) => void enrollIn(c)} />
          )}
        </>
      )}
    </CoursesShell>
  );
}
