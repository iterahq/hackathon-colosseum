import { AvatarLook } from '@/components/avatar/AvatarLook';
import type { LearnerAvatar } from '@/types/avatar';

/** Can an outfit be drawn on this avatar at all? Only the free expressions take the layer; a pair that was checked to misfit is left out by `AvatarLook`. */
export const outfitDrawable = (avatar: LearnerAvatar): boolean => avatar.allowsOutfit;

interface Props {
  /** The learner's CURRENT avatar: always the picture the learner wears, never the site's default Tera. */
  avatar: LearnerAvatar;
  /** The equipped outfit's item key. */
  outfit?: string | null;
  /** An outfit being tried on; `null` shows none, `undefined` leaves `outfit` in charge. */
  preview?: string | null;
  mood?: 'neutral' | 'happy';
  /** `xl` for the big stage. */
  size?: 'bubble' | 'xl';
}

/** The learner's look, drawn by the shared `AvatarLook`: the avatar's own picture, with the outfit on it where the art can carry one. */
export function ShopLook({ avatar, outfit = null, preview, size = 'xl' }: Props) {
  const worn = preview === undefined ? outfit : preview;
  if (!avatar.allowsOutfit) return <AvatarLook avatar={avatar} size="100%" className="h-full w-full" />;
  return <AvatarLook avatar={avatar} outfit={worn} size={size === 'xl' ? 128 : 72} />;
}
