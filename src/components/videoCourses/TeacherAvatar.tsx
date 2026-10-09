import { courseColor } from '@/utils/courses';
import { initials } from '@/utils/videoCourses';

interface Props {
  name: string;
  slug: string;
  size?: number;
}

export function TeacherAvatar({ name, slug, size = 28 }: Props) {
  const color = courseColor(slug);
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full [font:700_11px_JetBrains_Mono]"
      style={{ width: size, height: size, background: color.cs, color: color.cl, border: `1px solid ${color.cd}`, fontSize: size > 40 ? 16 : 11 }}
    >
      {initials(name)}
    </span>
  );
}
