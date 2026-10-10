import { LearnerAvatar } from '@/components/avatar/LearnerAvatar';
import { TeraOutfit } from '@/components/tera/TeraOutfit';
import { cosmeticOf } from '@/services/artPreview';
import { credentialImageUrl } from '@/services/credential.service';
import { useI18n } from '@/i18n';
import type { LearnerAvatar as Avatar } from '@/types/avatar';
import type { ShopItem } from '@/types/shop';
import type { CertTarget } from '@/types/shopView';
import { avatarOf } from '@/utils/avatarShop';
import { CertificationPreview } from './CertificationPreview';

interface Props {
  item: ShopItem;
  /** `true` shows the item on; `false` shows the learner as they are without it. */
  on: boolean;
  avatar: Avatar;
  target: CertTarget | null;
}

const BIG_FACE = '!h-44 !w-44 sm:!h-52 sm:!w-52';

/** The live picture of a try-on: the avatar as a large portrait, the outfit on Tera, an ink or a frame on a certification. */
export function TryOnStage({ item, on, avatar, target }: Props) {
  const { locale } = useI18n();
  if (item.kind === 'avatar') {
    return <LearnerAvatar avatar={(on ? avatarOf(item) : null) ?? avatar} size="xl" className={BIG_FACE} />;
  }
  if (item.kind === 'outfit') {
    return (
      <span className="flex h-52 items-end justify-center pb-5">
        <span className="block origin-bottom scale-[1.45]">
          <TeraOutfit mood={on ? 'happy' : 'neutral'} size="xl" outfit={null} preview={on ? item.key : null} />
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
