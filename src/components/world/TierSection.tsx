import { TIER_LORE, type LoreTier } from '@/content/teraLore';
import type { TeraCatalog } from '@/types/tera';
import { castKeysOfTier } from './castArt';
import { FOCUS_BUILD } from '@/config/focus';
import { useI18n } from '@/i18n';
import { ObtainBadges } from './ObtainBadges';
import { earnHow, obtainWays, type OwnedTeras } from './obtain';
import { TeraCard } from './TeraCard';
import { H2 } from './worldStyles';

/** One tier of the cast: its name, how its Teras are obtained (studying, or the shop as well), and its Teras, locked unless the wallet holds them. `owned` null: the page does not know the wallet, nothing is locked. */
export function TierSection({ tier, catalog, owned = null, onOpen }: { tier: LoreTier; catalog: TeraCatalog; owned?: OwnedTeras | null; onOpen: (key: string) => void }) {
  const { locale } = useI18n();
  const info = TIER_LORE(tier, locale);
  const keys = castKeysOfTier(tier, catalog.avatars);
  const ways = obtainWays(tier, catalog);
  // The focus build lets the badges say it: the catalog's sentence about an earn-only tier is odds and effort levels.
  const how = FOCUS_BUILD ? null : earnHow(tier, catalog, locale);
  if (keys.length === 0) return null;
  const solo = keys.length === 1;
  return (
    <section className="flex flex-col gap-4" aria-labelledby={`world-tier-${tier}`} data-testid={`world-tier-${tier}`}>
      <div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h3 id={`world-tier-${tier}`} className={H2}>{info.name}</h3>
          <ObtainBadges ways={ways} />
        </div>
        <p className="mt-2 max-w-[62ch] [font:400_14px_Inter] leading-relaxed text-[#A0978A]">{info.text}</p>
        {how && <p className="mt-2 max-w-[62ch] [font:600_13px_Inter] leading-relaxed text-[#C9BFB0]" data-testid={`world-obtain-${tier}`}>{how}</p>}
      </div>
      <ul className={`m-0 grid list-none gap-3 p-0 sm:gap-4 ${solo ? 'max-w-[320px] grid-cols-1' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
        {keys.map((key) => (
          <li key={key} className="min-w-0">
            <TeraCard avatarKey={key} tier={tier} hold={owned ? (key in owned ? 'unlocked' : 'locked') : 'open'} origin={owned?.[key] ?? null} solo={solo} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </section>
  );
}
