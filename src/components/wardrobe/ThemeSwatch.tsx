import { LearnerAvatar } from '@/components/avatar/LearnerAvatar';
import type { LearnerAvatar as Avatar } from '@/types/avatar';
import type { ThemeItem } from '@/types/crystals';
import { faviconSvg } from '@/utils/appTheme';

/** The picture of a theme tile: a canvas colour, the "I/" mark in an icon colour, or the learner's own picture wearing the border. */
export function ThemeSwatch({ item, avatar }: { item: ThemeItem; avatar: Avatar }) {
  if (item.slot === 'border') return <LearnerAvatar avatar={{ ...avatar, border: item.border }} size="lg" />;
  if (item.slot === 'icon') {
    return <img alt="" draggable={false} className="h-16 w-16 rounded-xl" src={`data:image/svg+xml,${encodeURIComponent(faviconSvg({ background: '#0A0908', icon: item.color ?? '#3FD17F' }))}`} />;
  }
  return (
    <span aria-hidden className="flex h-16 w-16 items-end justify-center rounded-xl border border-[#3A352F] pb-2" style={{ backgroundColor: item.color ?? '#0A0908' }}>
      <span className="h-1 w-8 rounded-full bg-[#3FD17F]" />
    </span>
  );
}
