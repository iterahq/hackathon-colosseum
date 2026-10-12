import { useState } from 'react';
import { useCompanion, useEquipOutfit } from '@/hooks/useCompanion';
import { useProfileAvatars } from '@/hooks/useProfileAvatars';
import { useEquipAvatar } from '@/hooks/useShopWardrobe';
import { useShop } from '@/hooks/useShop';
import { useI18n } from '@/i18n';
import { focusShopItems } from '@/utils/focusShop';
import { buildProfileLook, shownLookTabs, type LookTab } from '@/utils/profileLook';
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
  const [picked, setTab] = useState<LookTab | null>(null);
  // The focus build wears what is owned and the free faces; it never counts what a paid tier would add.
  const look = buildProfileLook(focusShopItems(shop.data ?? [], 'wardrobe'), current, outfit);
  const tabs = shownLookTabs(look);
  // Until the learner picks a tab the picker opens on the one that holds what is worn: a Tera just bought is on screen at once.
  const home: LookTab = look.looks.some((a) => a.key === current.key) ? 'looks' : look.gearAvatars.some((a) => a.key === current.key) ? 'gear' : 'faces';
  const tab = picked ?? home;
  const shown = tabs.includes(tab) ? tab : 'faces';
  // The stage says how the worn Tera was obtained: the shop row knows it even when the companion block does not.
  const worn = current.origin ?? [...look.faces, ...look.looks, ...look.gearAvatars].find((a) => a.key === current.key)?.origin ?? null;
  const busy = equipAvatar.isPending || equipOutfit.isPending;
  return (
    <section className="mt-6 rounded-3xl border border-[#262320] bg-[#141210] p-5 md:p-8" data-testid="avatar-picker">
      <h2 className="font-mono text-xs uppercase tracking-wider text-[#A0978A]">{t('avatar.look.title')}</h2>
      <div className="mt-4 flex flex-col gap-6 md:flex-row md:gap-8">
        <LookStageCard avatar={worn ? { ...current, origin: worn } : current} outfit={outfit} />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {tabs.length > 1 && <LookTabs tab={shown} tabs={tabs} counts={look.owned} onTab={setTab} />}
          <LookPanel tab={shown} look={look} currentKey={current.key} busy={busy} onAvatar={(a) => equipAvatar.mutate(a)} onOutfit={(k) => equipOutfit.mutate(k)} />
          {(equipAvatar.isError || equipOutfit.isError) && (
            <p role="alert" className="font-sans text-sm text-[#E07A4A]">{t('avatar.picker.error')}</p>
          )}
        </div>
      </div>
    </section>
  );
}
