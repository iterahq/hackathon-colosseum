import { Lock } from 'lucide-react';
import { OriginBadge } from '@/components/tera/OriginBadge';
import { loreOf, type LoreTier } from '@/content/teraLore';
import { useI18n } from '@/i18n';
import type { TeraOrigin } from '@/types/tera';
import { TeraPortrait } from './TeraPortrait';
import { FOCUS, PANEL } from './worldStyles';

/** `open`: the page does not know what the visitor holds (signed out), so nothing is locked. */
export type TeraHold = 'open' | 'locked' | 'unlocked';

/**
 * One Tera of the cast. Held by the wallet: in colour, with a green edge and how it was obtained. Not held: grey, dim,
 * with a lock. Either way it opens its story.
 */
export function TeraCard({ avatarKey, tier, hold, origin = null, solo = false, onOpen }: { avatarKey: string; tier: LoreTier; hold: TeraHold; origin?: TeraOrigin | null; solo?: boolean; onOpen: (key: string) => void }) {
  const { t, locale } = useI18n();
  const lore = loreOf(avatarKey, locale);
  if (!lore) return null;
  const locked = hold === 'locked';
  const unlocked = hold === 'unlocked';
  return (
    <button
      type="button"
      onClick={() => onOpen(avatarKey)}
      aria-label={t(locked ? 'world.open.locked' : unlocked ? 'world.open.unlocked' : 'world.open', { name: lore.name })}
      data-testid="world-tera"
      data-tera={avatarKey}
      data-hold={hold}
      data-origin={unlocked ? (origin?.kind ?? 'unknown') : undefined}
      className={`${PANEL} relative flex h-full w-full flex-col items-center gap-3 p-4 text-center transition-colors ${unlocked ? '!border-[#3FD17F] shadow-[0_0_0_1px_#3FD17F,0_10px_28px_-12px_#3FD17F99]' : 'hover:border-[#5E574E]'} ${FOCUS}`}
    >
      <span className="relative">
        <TeraPortrait avatarKey={avatarKey} tier={tier} size={solo ? 'xl' : 'md'} art={solo ? 'full' : 'chip'} locked={locked} />
        {locked && (
          <span aria-hidden className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-[#2E2A25] bg-[#0A0908] text-[#A0978A]" data-testid="world-tera-lock">
            <Lock size={15} />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className={`break-words [font:700_20px_'Barlow_Condensed'] uppercase leading-none ${locked ? 'text-[#8A8175]' : 'text-[#F4EDE2]'}`}>{lore.name}</span>
        <span className={`break-words [font:400_12px_Inter] leading-snug ${locked ? 'text-[#6F675D]' : 'text-[#A0978A]'}`}>{lore.epithet}</span>
      </span>
      {unlocked && (origin ? <OriginBadge origin={origin} transfer={false} className="mt-auto justify-center" /> : <span className="mt-auto [font:700_10px/1_JetBrains_Mono] uppercase tracking-[.08em] text-[#3FD17F]">{t('world.unlocked')}</span>)}
    </button>
  );
}
