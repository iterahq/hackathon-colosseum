import { TeraAvatar, type TeraSize } from '../../components/TeraAvatar.js';

/**
 * The scene guide's face — Tera, drawn by `TeraAvatar`. Kept as the scene
 * kinds' own name for him: `happy` when the learner nails it, `oops` on a
 * wrong try, otherwise waiting and blinking.
 */
export function GuideAvatar({
  happy,
  oops = false,
  size = 'bubble',
  className,
}: {
  happy: boolean;
  oops?: boolean;
  size?: Extract<TeraSize, 'bubble' | 'bar'>;
  className?: string;
}) {
  return <TeraAvatar mood={happy ? 'happy' : oops ? 'oops' : 'neutral'} size={size} className={className} />;
}
