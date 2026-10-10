/** The learner's profile picture: a free icon or an NFT avatar. `avatar` of `companion` / `learner-profile`, kind `avatar` of `shop-items`. */
export type AvatarRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type AvatarGroup = 'expression' | 'base' | 'special' | 'event' | 'accessory';

export interface LearnerAvatar {
  key: string;
  title: string;
  rarity: AvatarRarity;
  /** The tier's display name, e.g. "Super Tera". */
  tierName: string;
  imageUrl: string;
  thumbUrl: string;
  /** Set when the avatar is an NFT the learner owns. */
  assetAddress: string | null;
}

/** The avatar fields a shop item of kind `avatar` carries on top of the common ones. */
export interface AvatarOffer {
  rarity: AvatarRarity;
  rarityLabel: string;
  tierName: string;
  group: AvatarGroup;
  free: boolean;
  imageUrl: string;
  thumbUrl: string;
  supply: { minted: number; max: number | null };
  assetAddress: string | null;
}

export const DEFAULT_AVATAR_KEY = 'tera_normal';

/** What every learner wears until the backend says otherwise (or when it has no avatar block yet). */
export const DEFAULT_AVATAR: LearnerAvatar = {
  key: DEFAULT_AVATAR_KEY,
  title: 'Tera',
  rarity: 'common',
  tierName: 'Tera',
  imageUrl: '/mascot/tera-happy.webp',
  thumbUrl: '/mascot/tera-happy.webp',
  assetAddress: null,
};
