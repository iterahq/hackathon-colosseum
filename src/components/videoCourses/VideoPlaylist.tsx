import { Check } from 'lucide-react';
import { CourseProgressBar } from '@/components/courses/CourseProgressBar';
import { FOCUS, MONO_LABEL } from '@/components/courses/courseStyles';
import { useI18n } from '@/i18n';
import type { VideoCourse } from '@/types/videoCourses';
import { courseColor } from '@/utils/courses';
import { courseStats, formatClock } from '@/utils/videoCourses';
import { TeacherAvatar } from './TeacherAvatar';

interface Props {
  course: VideoCourse;
  progress: ReadonlyMap<string, number>;
  currentId: string;
  onSelect: (lessonId: string) => void;
}

export function VideoPlaylist({ course, progress, currentId, onSelect }: Props) {
  const { t } = useI18n();
  const color = courseColor(course.slug);
  const stats = courseStats(course, progress);

  return (
    <aside className="flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-[#262320] border-b-[5px] bg-[#141210]" style={{ borderBottomColor: color.c }} data-testid="playlist">
      <div className="flex flex-col gap-2.5 border-b border-[#262320] p-5">
        <span className={`${MONO_LABEL} uppercase tracking-[.1em]`} style={{ color: color.cl }}>
          {t('video.playlist')}
        </span>
        <h2 className="[font:700_28px/1_'Barlow_Condensed']">{course.title}</h2>
        <span className="flex items-center gap-2 [font:400_14px_Inter] text-[#C9BFB0]">
          <TeacherAvatar name={course.teacherName} slug={course.slug} size={24} />
          {course.teacherName}
        </span>
        <CourseProgressBar done={stats.watched} total={stats.total} color={color.cl} slots={Math.min(Math.max(stats.total, 1), 16)} />
        <span className={`${MONO_LABEL} text-[#A0978A]`}>{t('video.progress', { watched: stats.watched, total: stats.total })}</span>
      </div>
      <ol className="max-h-[420px] overflow-y-auto lg:max-h-[520px]">
        {course.lessons.map((lesson, index) => {
          const current = lesson.id === currentId;
          const done = progress.has(lesson.id);
          return (
            <li key={lesson.id} className="border-b border-[#1D1A17] last:border-b-0">
              <button
                type="button"
                onClick={() => onSelect(lesson.id)}
                aria-current={current ? 'true' : undefined}
                data-testid="playlist-row"
                className={`flex w-full items-center gap-3 px-5 py-3 text-left transition-colors ${FOCUS} ${current ? 'bg-[#1F1B17]' : 'hover:bg-[#1A1714]'}`}
                style={current ? { boxShadow: `inset 3px 0 0 ${color.c}` } : undefined}
              >
                <span className={`${MONO_LABEL} w-6 shrink-0 text-[#6F675C]`}>{String(index + 1).padStart(2, '0')}</span>
                <span className={`min-w-0 flex-1 [font:500_14px/1.35_Inter] ${current ? 'text-[#F4EDE2]' : 'text-[#C9BFB0]'}`}>{lesson.title}</span>
                <span className={`${MONO_LABEL} shrink-0 text-[#A0978A]`}>{formatClock(lesson.durationSeconds)}</span>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  {done && (
                    <>
                      <Check aria-hidden className="h-4 w-4 text-[#3FD17F]" />
                      <span className="sr-only">{t('video.watchedMark')}</span>
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
