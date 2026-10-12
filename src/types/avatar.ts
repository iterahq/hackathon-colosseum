import type { AvatarBorder } from '@/types/crystals';

/** The learner's profile picture: a free icon or an NFT avatar. `avatar` of `companion` / `learner-profile`, kind `avatar` of `shop-items`. */
export type AvatarRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'primordial';
export type AvatarGroup = 'expression' | 'base' | 'special' | 'event' | 'accessory';

export interface LearnerAvatar {
  key: string;
  title: string;
  rarity: AvatarRarity;
  /** The tier's display name, e.g. "Super Tera". */
  tierName: string;
  imageUrl: string;
  thumbUrl: string;
  /** 128 px tight circular crop of the ring: use it for EVERY round picture. */
  chipUrl: string;
  /** Set when the avatar is an NFT the learner owns. */
  assetAddress: string | null;
  /** Only the free expression icons take the outfit layer on top; a painted avatar is shown as it is. */
  allowsOutfit: boolean;
  /** The learner's profile border, drawn over the art's own ring; null or absent keeps the ring as it is. */
  border?: AvatarBorder | null;
}

/** The season an avatar is sold in; outside its window it is listed, not buyable. */
export interface AvatarSeason {
  key: string;
  label: string;
  startsAt: string | null;
  endsAt: string | null;
  available: boolean;
}

/** One thing that comes with an avatar (its border, glasses...). */
export interface AvatarInclude {
  key: string;
  kind: string;
  title: string;
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
  /** 128 px tight circular crop of the ring: use it for EVERY round picture. */
  chipUrl: string;
  supply: { minted: number; max: number | null };
  assetAddress: string | null;
  allowsOutfit: boolean;
  /** Never for sale at any price: the tier only comes out of the chest of a stamped day. */
  earnOnly?: boolean;
  /** A bought Tera can be sent to another wallet or resold. */
  transferable?: boolean;
  /** What a resale pays Itera, in basis points; 0 while no royalty is set on chain. */
  royaltyBps?: number;
  /** Null for an avatar sold all year. */
  season?: AvatarSeason | null;
  includes?: AvatarInclude[];
}

export const DEFAULT_AVATAR_KEY = 'tera_normal';
/** File stem of the default's art: `tera_normal` now points at `tera_a_normal` (`image_key`); the API's URLs win once loaded. The old stem still answers 200. */
const DEFAULT_ART = 'tera_a_normal';

const ART = 'https://nyzcbnnbffsizshiolbh.supabase.co/storage/v1/object/public/tera-avatars';
/** Shipped with the app: the last resort when the published art cannot be loaded. */
export const FALLBACK_AVATAR_IMAGE = '/mascot/tera-happy.webp';

/** What every learner wears until the backend says otherwise (or when it has no avatar block yet). */
export const DEFAULT_AVATAR: LearnerAvatar = {
  key: DEFAULT_AVATAR_KEY,
  title: 'Tera',
  rarity: 'common',
  tierName: 'Tera',
  imageUrl: `${ART}/${DEFAULT_ART}.webp`,
  thumbUrl: `${ART}/${DEFAULT_ART}_128.webp`,
  chipUrl: `${ART}/${DEFAULT_ART}_chip.webp`,
  assetAddress: null,
  allowsOutfit: true,
};
