import type { EnrollStates } from '@/hooks/useCoursesEnroll';
import type { Course } from '@/utils/courses';
import { CourseCard } from './CourseCard';

interface Props {
  courses: Course[];
  states: EnrollStates;
  canEnroll: boolean;
  onEnroll: (course: Course) => void;
}

export function CoursesGrid({ courses, states, canEnroll, onEnroll }: Props) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4" data-testid="course-grid">
      {courses.map((course) => {
        const own = states[course.id];
        const enroll = canEnroll && !course.enrolled ? { pending: own?.pending ?? false, failed: own?.failed ?? false, onEnroll: () => onEnroll(course) } : undefined;
        return <CourseCard key={course.id} course={course} enroll={enroll} />;
      })}
    </div>
  );
}
