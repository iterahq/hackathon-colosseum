import { LearnerAvatar } from '@/components/avatar/LearnerAvatar';
import placement from '@/components/avatar/outfitPlacement.json';
import type { LearnerAvatar as Avatar } from '@/types/avatar';

type Mood = 'neutral' | 'happy' | 'oops';
interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

const OUTFITS = ['outfit_glasses', 'outfit_crown', 'outfit_headphones', 'outfit_laurel'] as const;
const BASE = '/mascot/outfits';
const MOODS = placement.moods as Record<string, Mood>;
const OVERRIDES = placement.overrides as Record<string, Record<string, Partial<Transform>>>;
const DISABLED = placement.disabled as { outfit: string; avatar: string }[];

export const moodOfAvatar = (key: string): Mood => MOODS[key] ?? 'neutral';

/** The transform of an outfit layer onto the 512 px art of one avatar: the default, then the outfit's, then the pair's own. */
export function placementOf(outfit: string, avatarKey: string): Transform {
  const o = OVERRIDES[outfit] ?? {};
  return { ...(placement.default as Transform), ...o['*'], ...o[avatarKey] };
}

/** An outfit is drawn only on an avatar that allows the layer and where it was checked to sit right. */
export function outfitFits(outfit: string | null | undefined, avatar: Pick<Avatar, 'key' | 'allowsOutfit'>): outfit is string {
  return Boolean(outfit) && (OUTFITS as readonly string[]).includes(outfit as string) && avatar.allowsOutfit && !DISABLED.some((d) => d.outfit === outfit && d.avatar === avatar.key);
}

/** The outfit is known and the avatar takes the layer, but this pair was checked and does not fit: the look shows the avatar bare. */
export function outfitMisfit(outfit: string | null | undefined, avatar: Pick<Avatar, 'key' | 'allowsOutfit'>): boolean {
  return Boolean(outfit) && avatar.allowsOutfit && DISABLED.some((d) => d.outfit === outfit && d.avatar === avatar.key);
}

interface Props {
  avatar: Avatar;
  /** The outfit to draw: the equipped one, or the one being tried. */
  outfit?: string | null;
  /** Edge of the square box: px, or a CSS length such as '92%'. The box is the whole 512 px art (the crest included). */
  size: number | string;
  className?: string;
}

/**
 * THE composition of a learner's look: the learner's OWN avatar picture, big, with the outfit layer on
 * it when the avatar allows it. Never the site's default Tera next to a chip. A painted avatar is a
 * whole head and stands alone with its profile border; a free expression takes the layer, on that
 * same expression. The numbers live in `outfitPlacement.json`, which the backend reads too.
 */
export function AvatarLook({ avatar, outfit = null, size, className = '' }: Props) {
  if (!avatar.allowsOutfit) {
    return (
      <span className={`relative inline-flex shrink-0 items-center justify-center ${className}`} style={{ width: size, aspectRatio: '1 / 1' }} data-testid="avatar-look" data-avatar={avatar.key} data-outfit="none">
        <LearnerAvatar avatar={avatar} size="xl" className="!h-[86%] !w-[86%]" />
      </span>
    );
  }
  const worn = outfitFits(outfit, avatar) ? outfit : null;
  const mood = moodOfAvatar(avatar.key);
  const t = worn ? placementOf(worn, avatar.key) : null;
  const canvas = placement.avatarCanvas;
  const layer = (src: string, part: 'back' | 'front') =>
    t && (
      <img
        key={part}
        src={src}
        alt=""
        aria-hidden
        draggable={false}
        data-outfit-layer={part}
        className="pointer-events-none absolute max-w-none select-none"
        style={{
          left: `${(t.x / canvas) * 100}%`,
          top: `${(t.y / canvas) * 100}%`,
          width: `${((placement.layerCanvas.width * t.scale) / canvas) * 100}%`,
          transform: t.rotation ? `rotate(${t.rotation}deg)` : undefined,
          transformOrigin: '50% 50%',
        }}
      />
    );
  const front = worn ? (mood === 'neutral' || worn === 'outfit_laurel' ? `${BASE}/${worn}-front.webp` : `${BASE}/${worn}-front-${mood}.webp`) : '';
  return (
    <span className={`relative inline-block shrink-0 overflow-hidden ${className}`} style={{ width: size, aspectRatio: '1 / 1' }} data-testid="avatar-look" data-avatar={avatar.key} data-outfit={worn ?? 'none'}>
      {worn === 'outfit_laurel' && layer(`${BASE}/outfit_laurel-back.webp`, 'back')}
      <img src={avatar.imageUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none" />
      {worn && layer(front, 'front')}
    </span>
  );
}
