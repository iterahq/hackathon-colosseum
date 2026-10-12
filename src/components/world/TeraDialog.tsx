import * as Dialog from '@radix-ui/react-dialog';
import { Link } from 'react-router-dom';
import { OriginBadge } from '@/components/tera/OriginBadge';
import { loreOf, loreRelated, loreTierOf, TIER_LORE } from '@/content/teraLore';
import type { TeraCatalog } from '@/types/tera';
import { useI18n } from '@/i18n';
import { LockedBadge, ObtainBadges } from './ObtainBadges';
import { obtainWays, type OwnedTeras } from './obtain';
import { TeraPortrait } from './TeraPortrait';
import { FOCUS, LABEL } from './worldStyles';

/** One Tera's story and quote, with links to its kin. For a signed-in learner it also says whether the wallet holds it: how it was obtained, or that it is locked and how it is obtained. Radix traps focus and closes on Esc. */
export function TeraDialog({ avatarKey, catalog, owned = null, onSelect, onClose }: { avatarKey: string | null; catalog: TeraCatalog; owned?: OwnedTeras | null; onSelect: (key: string) => void; onClose: () => void }) {
  const { t, locale } = useI18n();
  const lore = avatarKey ? loreOf(avatarKey, locale) : null;
  const tier = avatarKey ? loreTierOf(avatarKey, catalog.avatars) : 'free';
  const held = Boolean(avatarKey && owned && avatarKey in owned);
  const locked = Boolean(avatarKey && owned && !held && tier !== 'free');
  const origin = avatarKey && owned ? (owned[avatarKey] ?? null) : null;
  const ways = obtainWays(tier, catalog);
  const related = avatarKey ? loreRelated(avatarKey, locale) : [];
  return (
    <Dialog.Root open={Boolean(lore)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#0A0908]/80 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="world-dialog"
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-24px)] w-[min(520px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[14px] border border-[#2E2A25] border-b-[5px] border-b-[#262320] bg-[#141210] p-5 text-[#F4EDE2] shadow-[0_24px_60px_rgba(0,0,0,.6)] sm:p-7"
        >
          {lore && (
            <div className="flex flex-col items-center gap-4 text-center">
              <TeraPortrait avatarKey={lore.key} tier={tier} size="xl" locked={locked} />
              <span className={`${LABEL} text-[#A0978A]`}>{TIER_LORE(tier, locale).name}</span>
              {(held || locked || ways.length > 0) && (
                <div className="flex flex-wrap items-center justify-center gap-1.5" data-testid="world-dialog-hold" data-hold={held ? 'unlocked' : locked ? 'locked' : 'open'}>
                  {held && origin && <OriginBadge origin={origin} transfer={false} />}
                  {locked && <LockedBadge />}
                  {!held && <ObtainBadges ways={ways} />}
                </div>
              )}
              <div className="flex flex-col gap-1">
                <Dialog.Title className="m-0 break-words [font:700_36px_'Barlow_Condensed'] uppercase leading-none">{lore.name}</Dialog.Title>
                <span className="[font:500_14px_Inter] text-[#A0978A]">{lore.epithet}</span>
              </div>
              <p className="m-0 text-left [font:400_15px_Inter] leading-[1.7] text-[#C9BFB0]">{lore.story}</p>
              <blockquote className="m-0 w-full border-l-4 border-[#3FD17F] pl-4 text-left [font:500_17px_Inter] italic text-[#F4EDE2]">“{lore.quote}”</blockquote>
              {related.length > 0 && (
                <div className="flex w-full flex-col items-start gap-2">
                  <span className={`${LABEL} text-[#A0978A]`}>{t('world.related')}</span>
                  <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                    {related.map((r) => (
                      <li key={r.key}>
                        <button type="button" onClick={() => onSelect(r.key)} className={`min-h-11 rounded-full border border-[#2E2A25] px-4 [font:600_14px_Inter] text-[#F4EDE2] hover:border-[#5E574E] ${FOCUS}`}>
                          {r.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {locked && ways.includes('buy') && (
                <Link to="/shop" className={`inline-flex min-h-11 w-full items-center justify-center rounded-[12px] border-b-[5px] border-[#249457] bg-[#3FD17F] px-5 [font:700_15px_Inter] text-[#0A0908] hover:bg-[#5BE095] ${FOCUS}`} data-testid="world-dialog-shop">
                  {t('world.dialog.shop')}
                </Link>
              )}
              <Dialog.Close className={`min-h-11 w-full rounded-[12px] border-2 border-b-[5px] border-[#2E2A25] bg-[#141210] px-5 [font:700_15px_Inter] text-[#F4EDE2] hover:border-[#5E574E] ${FOCUS}`}>
                {t('world.close')}
              </Dialog.Close>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
