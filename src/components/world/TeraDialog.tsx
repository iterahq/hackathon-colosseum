import * as Dialog from '@radix-ui/react-dialog';
import { loreOf, loreRelated, loreTierOf, TIER_LORE, type TierMap } from '@/content/teraLore';
import { useI18n } from '@/i18n';
import { TeraPortrait } from './TeraPortrait';
import { FOCUS, LABEL } from './worldStyles';

/** One Tera's story and quote, with links to its kin. Radix traps focus and closes on Esc. */
export function TeraDialog({ avatarKey, avatars, onSelect, onClose }: { avatarKey: string | null; avatars?: TierMap; onSelect: (key: string) => void; onClose: () => void }) {
  const { t, locale } = useI18n();
  const lore = avatarKey ? loreOf(avatarKey, locale) : null;
  const tier = avatarKey ? loreTierOf(avatarKey, avatars) : 'free';
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
              <TeraPortrait avatarKey={lore.key} tier={tier} size="xl" />
              <span className={`${LABEL} text-[#A0978A]`}>{TIER_LORE(tier, locale).name}</span>
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
