import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CoursesShell } from '@/components/courses/CoursesShell';
import { FOCUS } from '@/components/courses/courseStyles';
import { TeacherCard } from '@/components/videoCourses/TeacherCard';
import { VideoPlayer } from '@/components/videoCourses/VideoPlayer';
import { VideoPlaylist } from '@/components/videoCourses/VideoPlaylist';
import { VideoState } from '@/components/videoCourses/VideoStates';
import { useToggleWatched, useVideoCourses } from '@/hooks/useVideoCourses';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useI18n } from '@/i18n';
import { defaultLessonId, nextLessonId, teacherCourseCount } from '@/utils/videoCourses';

function CourseSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]" data-testid="course-loading" aria-busy="true">
      <div className="flex flex-col gap-5">
        <div className="aspect-video animate-pulse rounded-[14px] bg-[#141210]" />
        <div className="h-10 w-2/3 animate-pulse rounded bg-[#141210]" />
        <div className="h-20 animate-pulse rounded bg-[#141210]" />
      </div>
      <div className="h-[460px] animate-pulse rounded-[14px] bg-[#141210]" />
    </div>
  );
}

/** One video course: the player and its actions on the left, the playlist and the teacher on the right. */
export default function CoursePage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { courses, progress, isPending, isError, refetch } = useVideoCourses();
  const toggle = useToggleWatched();

  const course = courses.find((c) => c.slug === slug);
  usePageTitle(course?.title);
  const requested = params.get('v');
  const lesson = course?.lessons.find((l) => l.id === requested) ?? course?.lessons.find((l) => l.id === defaultLessonId(course, progress));

  const select = (lessonId: string) => {
    toggle.reset();
    setParams({ v: lessonId });
  };

  return (
    <CoursesShell>
      <Link to="/catalog" className={`inline-flex w-fit items-center gap-2 rounded [font:500_13px_JetBrains_Mono] text-[#A0978A] hover:text-[#F4EDE2] ${FOCUS}`}>
        <ArrowLeft className="h-4 w-4" />
        {t('video.back')}
      </Link>
      {isPending && <CourseSkeleton />}
      {!isPending && isError && <VideoState kind="error" onAction={refetch} />}
      {!isPending && !isError && (!course || !lesson) && <VideoState kind="notFound" onAction={() => navigate('/catalog')} />}
      {!isPending && !isError && course && lesson && (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <VideoPlayer
            course={course}
            lesson={lesson}
            watched={progress.has(lesson.id)}
            hasNext={nextLessonId(course, lesson.id, progress) !== null}
            saveFailed={toggle.isError}
            onToggle={() => {
              const watched = !progress.has(lesson.id);
              toggle.mutate({ lessonId: lesson.id, watched });
              const next = watched ? nextLessonId(course, lesson.id, progress) : null;
              if (next) setParams({ v: next });
            }}
            onNext={() => {
              const next = nextLessonId(course, lesson.id, progress);
              if (next) select(next);
            }}
          />
          <div className="flex min-w-0 flex-col gap-5">
            <VideoPlaylist course={course} progress={progress} currentId={lesson.id} onSelect={select} />
            <TeacherCard name={course.teacherName} slug={course.slug} courseCount={teacherCourseCount(courses, course.teacherName)} />
          </div>
        </div>
      )}
    </CoursesShell>
  );
}
