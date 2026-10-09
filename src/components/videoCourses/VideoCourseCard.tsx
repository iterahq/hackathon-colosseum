import { Link } from 'react-router-dom';
import { CourseProgressBar } from '@/components/courses/CourseProgressBar';
import { CHIP, FOCUS, MONO_LABEL } from '@/components/courses/courseStyles';
import { useI18n } from '@/i18n';
import type { VideoCourse } from '@/types/videoCourses';
import { courseColor } from '@/utils/courses';
import { courseStats, formatTotal } from '@/utils/videoCourses';
import { CourseThumb } from './CourseThumb';
import { TeacherAvatar } from './TeacherAvatar';

const STATE_COLOR = { new: '#A0978A', in_progress: '#F2C66D', done: '#3FD17F' } as const;

export function VideoCourseCard({ course, progress }: { course: VideoCourse; progress: ReadonlyMap<string, number> }) {
  const { t } = useI18n();
  const color = courseColor(course.slug);
  const stats = courseStats(course, progress);

  return (
    <article
      data-testid="course-card"
      data-state={stats.state}
      className="group relative flex flex-col overflow-hidden rounded-[14px] border border-[#262320] border-b-[5px] bg-[#141210] text-left transition-transform duration-100 hover:-translate-y-1 [&:has(a:active)]:translate-y-[3px]"
      style={{ borderBottomColor: color.c }}
    >
      <CourseThumb title={course.title} slug={course.slug} src={course.thumbnailUrl} />
      <span className="flex flex-1 flex-col gap-2.5 px-[18px] pb-[18px] pt-4">
        <Link
          to={`/course/${course.slug}`}
          className={`line-clamp-2 min-h-[56px] rounded [font:700_28px/1_'Barlow_Condensed'] after:absolute after:inset-0 after:content-[''] ${FOCUS}`}
        >
          {course.title}
        </Link>
        <span className="flex items-center gap-2 [font:400_14px_Inter] text-[#C9BFB0]">
          <TeacherAvatar name={course.teacherName} slug={course.slug} />
          <span className="truncate">{course.teacherName}</span>
        </span>
        <span className={`${MONO_LABEL} text-[#A0978A]`}>{t('video.meta', { n: stats.total, duration: formatTotal(stats.durationSeconds) })}</span>
        <span className="mt-auto flex items-center gap-3 pt-1.5">
          <CourseProgressBar done={stats.watched} total={stats.total} color={color.cl} slots={10} className="flex-1" />
          <span className={`${MONO_LABEL} text-[#C9BFB0]`}>{t('video.watched', { watched: stats.watched, total: stats.total })}</span>
        </span>
        <span className={`${CHIP} self-start border border-current`} style={{ color: STATE_COLOR[stats.state] }} data-testid="course-state">
          {t(`video.state.${stats.state}`)}
        </span>
      </span>
    </article>
  );
}
