/** Pure grouping of the shop list into the three profile tabs. Families are told apart by `kind` and `group` only. */
import { DEFAULT_AVATAR, type LearnerAvatar } from '@/types/avatar';
import type { ShopItem } from '@/types/shop';

export type LookTab = 'faces' | 'looks' | 'gear';

export interface OutfitChip {
  key: string;
  title: string;
  equipped: boolean;
}

export interface ProfileLook {
  faces: LearnerAvatar[];
  looks: LearnerAvatar[];
  gearAvatars: LearnerAvatar[];
  outfits: OutfitChip[];
  /** Outfits can be worn only over an avatar that allows them. */
  outfitsAllowed: boolean;
  /** Items of each tab the learner does not own: only ever shown as a count. */
  missing: Record<LookTab, number>;
  /** Items the learner owns per tab, outfits included in `gear`. */
  owned: Record<LookTab, number>;
}

const toAvatar = (item: ShopItem): LearnerAvatar => {
  const a = item.avatar!;
  return {
    key: item.key,
    title: item.title,
    rarity: a.rarity,
    tierName: a.tierName,
    imageUrl: a.imageUrl,
    thumbUrl: a.thumbUrl,
    chipUrl: a.chipUrl,
    assetAddress: a.assetAddress,
    allowsOutfit: a.allowsOutfit,
  };
};

export function buildProfileLook(items: ShopItem[], current: LearnerAvatar, outfit: string | null): ProfileLook {
  const faces: LearnerAvatar[] = [];
  const looks: LearnerAvatar[] = [];
  const gearAvatars: LearnerAvatar[] = [];
  const outfits: OutfitChip[] = [];
  const missing: Record<LookTab, number> = { faces: 0, looks: 0, gear: 0 };

  for (const item of items) {
    if (item.kind === 'avatar' && item.avatar) {
      const free = item.avatar.free;
      const owned = free || item.owned;
      const tab: LookTab = item.avatar.group === 'accessory' ? 'gear' : free ? 'faces' : 'looks';
      if (!owned) missing[tab] += 1;
      else if (tab === 'faces') faces.push(toAvatar(item));
      else if (tab === 'looks') looks.push(toAvatar(item));
      else gearAvatars.push(toAvatar(item));
    } else if (item.kind === 'outfit') {
      if (item.owned) outfits.push({ key: item.key, title: item.title, equipped: item.key === outfit });
      else missing.gear += 1;
    }
  }

  const all = [...faces, ...looks, ...gearAvatars];
  if (!all.some((a) => a.key === current.key)) faces.unshift(current.key === DEFAULT_AVATAR.key ? DEFAULT_AVATAR : current);

  return {
    faces,
    looks,
    gearAvatars,
    outfits,
    outfitsAllowed: current.allowsOutfit,
    missing,
    owned: { faces: faces.length, looks: looks.length, gear: gearAvatars.length + outfits.length },
  };
}
