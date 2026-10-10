import { TeraOutfit } from '@/components/tera/TeraOutfit';
import { DEFAULT_AVATAR_KEY, type LearnerAvatar } from '@/types/avatar';

/**
 * Can an outfit be drawn on this avatar today? Outfit art is painted for the base Tera only: a painted
 * avatar never takes one, and a free expression other than the base would show another face.
 * One file to swap for the shared avatar composition once it lands.
 */
export const outfitDrawable = (avatar: LearnerAvatar): boolean => avatar.allowsOutfit && avatar.key === DEFAULT_AVATAR_KEY;

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

/** The learner's look: the avatar's own picture, with an outfit only where the art can carry one. */
export function ShopLook({ avatar, outfit = null, preview, mood = 'neutral', size = 'xl' }: Props) {
  if (outfitDrawable(avatar)) return <TeraOutfit mood={mood} size={size} outfit={outfit} preview={preview} />;
  return <img src={avatar.imageUrl} alt={avatar.title} draggable={false} className="h-full w-full object-contain" data-testid="shop-look-art" data-avatar={avatar.key} />;
}
