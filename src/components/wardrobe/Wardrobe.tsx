import { TeraAvatar } from '@iterahq/activities';
import { BTN_PRIMARY, BTN_SMALL, CARD, FOCUS, H2, MONO_LABEL } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';
import type { LearnerAvatar } from '@/types/avatar';
import type { ShopItem } from '@/types/shop';
import type { CertTarget, ShopActions } from '@/types/shopView';
import { LookStage } from './LookStage';
import { buildWardrobeGroups } from './wardrobeGroups';

interface Props {
  items: ShopItem[];
  actions: ShopActions;
  avatar: LearnerAvatar;
  outfit: string | null;
  certs: CertTarget[];
  /** The last equip was refused. */
  failed?: boolean;
  onShop: (section: string, trailId?: string) => void;
}

/** "Personalizar": everything the learner owns, by group, each thing with one action. The groups come from `buildWardrobeGroups`. */
export function Wardrobe({ items, actions, avatar, outfit, certs, failed = false, onShop }: Props) {
  const { t, locale } = useI18n();
  const groups = buildWardrobeGroups({ items, actions, avatar, certs, locale, t, onShop });
  const bought = items.some((i) => i.owned && i.kind !== 'life' && !i.avatar?.free) || items.some((i) => i.ownedRefs.length > 0);
  const jump = (id: string) => document.getElementById(`wardrobe-${id}`)?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });

  return (
    <div className="flex flex-col gap-8" data-testid="wardrobe">
      <section className={`${CARD} flex flex-col items-center gap-5 border-b-[5px] border-b-[#2E2A25] p-5 sm:flex-row sm:gap-7 sm:p-6`}>
        <LookStage avatar={avatar} outfit={outfit} className="!h-[180px] !w-[180px]" />
        <div className="flex min-w-0 flex-1 flex-col gap-3 max-sm:items-center max-sm:text-center">
          <span className={`${MONO_LABEL} text-[#A0978A]`}>{t('wardrobe.look')}</span>
          <h2 className="[font:700_40px/1_'Barlow_Condensed']">{t('wardrobe.title')}</h2>
          <p className="[font:400_15px/1.5_Inter] text-[#C9BFB0]">{t('wardrobe.subtitle')}</p>
          {failed && <p role="alert" className="[font:600_13px_Inter] text-[#E0A86F]" data-testid="wardrobe-error">{t('wardrobe.error')}</p>}
          <nav aria-label={t('wardrobe.groups')} className="-mx-1 flex max-w-full flex-wrap gap-2 px-1 max-sm:justify-center" data-testid="wardrobe-nav">
            {groups.map((group) => (
              <button key={group.id} type="button" onClick={() => jump(group.id)} className={`inline-flex min-h-11 items-center gap-2 rounded-full border border-[#2E2A25] bg-[#0F0D0B] px-3.5 [font:600_13px_Inter] text-[#F4EDE2] hover:border-[#5E574E] ${FOCUS}`}>
                {group.title}
                <span className="[font:700_11px_JetBrains_Mono] text-[#A0978A]">{group.count}</span>
              </button>
            ))}
          </nav>
        </div>
      </section>
      {!bought && (
        <div className={`${CARD} flex flex-col items-center gap-3 p-5 text-center sm:flex-row sm:text-left`} data-testid="wardrobe-empty">
          <TeraAvatar mood="happy" size="bubble" />
          <div className="min-w-0 flex-1">
            <p className="[font:700_24px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">{t('wardrobe.empty.title')}</p>
            <p className="mt-1 [font:400_14px/1.45_Inter] text-[#A0978A]">{t('wardrobe.empty.body')}</p>
          </div>
          <button type="button" onClick={() => onShop('shop-avatars')} className={`${BTN_PRIMARY} ${BTN_SMALL}`}>{t('wardrobe.goShop')}</button>
        </div>
      )}
      {groups.map((group) => (
        <section key={group.id} id={`wardrobe-${group.id}`} aria-labelledby={`wardrobe-${group.id}-title`} data-testid="wardrobe-group" data-group={group.id} className="flex scroll-mt-24 flex-col gap-4">
          <div>
            <h3 id={`wardrobe-${group.id}-title`} className={H2}>{group.title}</h3>
            {group.hint && <p className="mt-1 [font:400_14px_Inter] text-[#A0978A]">{group.hint}</p>}
          </div>
          {group.content}
        </section>
      ))}
    </div>
  );
}
