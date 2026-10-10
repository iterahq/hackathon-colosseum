import { cosmeticOf } from '@/services/artPreview';
import { credentialImageUrl } from '@/services/credential.service';
import { useI18n } from '@/i18n';
import type { LearnerAvatar as Avatar } from '@/types/avatar';
import type { ShopItem } from '@/types/shop';
import type { CertTarget } from '@/types/shopView';
import { avatarOf } from '@/utils/avatarShop';
import { CertificationPreview } from './CertificationPreview';
import { ShopLook, outfitDrawable } from './ShopLook';

interface Props {
  item: ShopItem;
  /** `true` shows the item on; `false` shows the learner as they are without it. */
  on: boolean;
  avatar: Avatar;
  target: CertTarget | null;
}

const BIG_FACE = 'h-48 w-48 sm:h-56 sm:w-56';

/** The live picture of a try-on: the avatar as a large portrait, the outfit on Tera, an ink or a frame on a certification. */
export function TryOnStage({ item, on, avatar, target }: Props) {
  const { locale } = useI18n();
  if (item.kind === 'avatar') {
    const shown = (on ? avatarOf(item) : null) ?? avatar;
    return <img src={shown.imageUrl} alt={shown.title} width={224} height={224} className={`${BIG_FACE} rounded-[16px] bg-[#0F0D0B] object-contain`} data-testid="tryon-avatar-art" />;
  }
  if (item.kind === 'outfit') {
    // The learner's own avatar stays on stage; an outfit is drawn only where the art can carry it.
    if (!outfitDrawable(avatar)) return <span className="flex h-52 w-52 items-center justify-center"><ShopLook avatar={avatar} /></span>;
    return (
      <span className="flex h-52 items-end justify-center pb-5">
        <span className="block origin-bottom scale-[1.45]">
          <ShopLook avatar={avatar} mood={on ? 'happy' : 'neutral'} outfit={null} preview={on ? item.key : null} />
        </span>
      </span>
    );
  }
  const cosmetic = cosmeticOf(item);
  const color = typeof item.art.color === 'string' ? item.art.color : null;
  const owned = Boolean(target) && item.ownedRefs.includes(target?.trailId ?? '');
  const real = owned && on && target?.credentialId ? credentialImageUrl(target.credentialId, locale, `${target.daysDone}-${target.tier ?? ''}`) : null;
  return <CertificationPreview target={target} ink={on ? cosmetic.ink : null} frame={on ? cosmetic.frame : null} color={color} realSrc={real} width={210} />;
}
