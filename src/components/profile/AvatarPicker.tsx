import { useState } from 'react';
import { useCompanion, useEquipOutfit } from '@/hooks/useCompanion';
import { useProfileAvatars } from '@/hooks/useProfileAvatars';
import { useEquipAvatar } from '@/hooks/useShopWardrobe';
import { useShop } from '@/hooks/useShop';
import { useI18n } from '@/i18n';
import { buildProfileLook, type LookTab } from '@/utils/profileLook';
import { LookPanel } from './look/LookPanel';
import { LookStageCard } from './look/LookStageCard';
import { LookTabs } from './look/LookTabs';

/** "Meu Tera": the current look on a stage, and three tabs (faces, looks, accessories) to wear what the learner owns. */
export function AvatarPicker() {
  const { t } = useI18n();
  const { current } = useProfileAvatars();
  const shop = useShop();
  const { outfit } = useCompanion();
  const equipAvatar = useEquipAvatar();
  const equipOutfit = useEquipOutfit();
  const [tab, setTab] = useState<LookTab>('faces');
  const look = buildProfileLook(shop.data ?? [], current, outfit);
  const busy = equipAvatar.isPending || equipOutfit.isPending;
  return (
    <section className="mt-6 rounded-3xl border border-[#262320] bg-[#141210] p-5 md:p-8" data-testid="avatar-picker">
      <h2 className="font-mono text-xs uppercase tracking-wider text-[#A0978A]">{t('avatar.look.title')}</h2>
      <div className="mt-4 flex flex-col gap-6 md:flex-row md:gap-8">
        <LookStageCard avatar={current} outfit={outfit} />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <LookTabs tab={tab} counts={look.owned} onTab={setTab} />
          <LookPanel tab={tab} look={look} currentKey={current.key} busy={busy} onAvatar={(a) => equipAvatar.mutate(a)} onOutfit={(k) => equipOutfit.mutate(k)} />
          {(equipAvatar.isError || equipOutfit.isError) && (
            <p role="alert" className="font-sans text-sm text-[#E07A4A]">{t('avatar.picker.error')}</p>
          )}
        </div>
      </div>
    </section>
  );
}
