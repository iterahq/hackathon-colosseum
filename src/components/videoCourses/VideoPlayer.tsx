import { Check } from 'lucide-react';
import { FOCUS } from '@/components/courses/courseStyles';
import { useI18n } from '@/i18n';
import type { VideoCourse, VideoLesson } from '@/types/videoCourses';
import { courseColor } from '@/utils/courses';
import { embedUrl } from '@/utils/videoCourses';

interface Props {
  course: VideoCourse;
  lesson: VideoLesson;
  watched: boolean;
  hasNext: boolean;
  saveFailed: boolean;
  onToggle: () => void;
  onNext: () => void;
}

const CHUNKY = `inline-flex h-[52px] items-center justify-center gap-2 rounded-xl border-0 border-b-[5px] px-6 [font:700_22px_'Barlow_Condensed'] transition-transform duration-75 active:translate-y-1 active:border-b-[1px] max-sm:w-full ${FOCUS}`;

/** The 16:9 YouTube player with the title, description and the watched / next actions under it. */
export function VideoPlayer({ course, lesson, watched, hasNext, saveFailed, onToggle, onNext }: Props) {
  const { t } = useI18n();
  const color = courseColor(course.slug);

  return (
    <section className="flex min-w-0 flex-col gap-5" data-testid="video-player">
      <div className="overflow-hidden rounded-[14px] border border-[#262320] border-b-[5px] bg-black" style={{ borderBottomColor: color.c }}>
        <iframe
          key={lesson.id}
          src={embedUrl(lesson.videoUrl)}
          title={t('video.playerTitle', { course: course.title, title: lesson.title })}
          className="block aspect-video w-full"
          loading="lazy"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <h1 className="[font:700_40px/1_'Barlow_Condensed'] max-sm:text-[30px]">{lesson.title}</h1>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={watched}
          data-testid="mark-watched"
          className={CHUNKY}
          style={watched ? { background: '#1C3A2A', color: '#3FD17F', borderBottomColor: '#1F8A4F' } : { background: '#3FD17F', color: '#0A0908', borderBottomColor: '#1F8A4F' }}
        >
          {watched && <Check className="h-5 w-5" />}
          {watched ? t('video.unmarkWatched') : t('video.markWatched')}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext}
          data-testid="next-video"
          className={`${CHUNKY} border border-b-[5px] border-[#262320] border-b-[#3A352F] bg-[#141210] text-[#F4EDE2] disabled:opacity-40`}
        >
          {hasNext ? t('video.next') : t('video.finished')}
        </button>
      </div>
      <p className="max-w-[70ch] whitespace-pre-line [font:400_16px/1.55_Inter] text-[#A0978A]">{lesson.description || t('video.noDescription')}</p>
      {saveFailed && (
        <span role="alert" className="[font:500_12px_JetBrains_Mono] text-[#E07A4A]">
          {t('video.saveError')}
        </span>
      )}
    </section>
  );
}
