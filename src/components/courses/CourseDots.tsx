import { useI18n } from '@/i18n';
import type { DotState } from '@/utils/courses';

interface Props {
  dots: DotState[];
  color: { c: string; cd: string };
  size?: 'sm' | 'lg';
}

/** One dot per trail of a course: filled when done, ringed when open, dim when locked. */
export function CourseDots({ dots, color, size = 'sm' }: Props) {
  const { t } = useI18n();
  if (dots.length === 0) return null;
  const px = size === 'lg' ? 'h-4 w-4' : 'h-2.5 w-2.5';
  return (
    <span className="flex items-center gap-1.5" data-testid="course-dots">
      {dots.map((state, i) => (
        <span
          key={i}
          role="img"
          aria-label={t(`courses.dot.${state}`)}
          data-dot={state}
          className={`${px} rounded-full border-2`}
          style={{
            background: state === 'done' ? color.c : state === 'current' ? '#0A0908' : '#1C1916',
            borderColor: state === 'locked' ? '#2E2A25' : state === 'current' ? color.c : color.cd,
          }}
        />
      ))}
    </span>
  );
}
