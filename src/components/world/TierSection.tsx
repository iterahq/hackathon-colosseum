import { TIER_LORE, loreOf, type LoreTier } from '@/content/teraLore';
import type { TeraCatalog } from '@/types/tera';
import { castKeysOfTier } from './castArt';
import { useI18n } from '@/i18n';
import { TeraPortrait } from './TeraPortrait';
import { FOCUS, H2, PANEL } from './worldStyles';

/** How the Teras of a tier are obtained, said only once the live catalog answered: a free face, a tier on the shelf, or a tier that is never for sale. */
export const obtainKey = (tier: LoreTier, catalog: TeraCatalog): string | null => {
  if (catalog.source !== 'live') return null;
  if (tier === 'free') return 'world.obtain.free';
  const entry = catalog.tiers.find((t) => t.rarity === tier);
  if (!entry) return null;
  return entry.earnOnly ? (tier === 'primordial' ? 'world.obtain.primordial' : 'world.obtain.earnOnly') : 'world.obtain.shelf';
};

export function TierSection({ tier, catalog, onOpen }: { tier: LoreTier; catalog: TeraCatalog; onOpen: (key: string) => void }) {
  const { t, locale } = useI18n();
  const info = TIER_LORE(tier, locale);
  const keys = castKeysOfTier(tier, catalog.avatars);
  const obtain = obtainKey(tier, catalog);
  if (keys.length === 0) return null;
  const solo = keys.length === 1;
  return (
    <section className="flex flex-col gap-4" aria-labelledby={`world-tier-${tier}`} data-testid={`world-tier-${tier}`}>
      <div>
        <h3 id={`world-tier-${tier}`} className={H2}>{info.name}</h3>
        <p className="mt-2 max-w-[62ch] [font:400_14px_Inter] leading-relaxed text-[#A0978A]">{info.text}</p>
        {obtain && <p className="mt-2 max-w-[62ch] [font:600_13px_Inter] leading-relaxed text-[#C9BFB0]" data-testid={`world-obtain-${tier}`}>{t(obtain)}</p>}
      </div>
      <ul className={`m-0 grid list-none gap-3 p-0 sm:gap-4 ${solo ? 'max-w-[320px] grid-cols-1' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
        {keys.map((key) => {
          const lore = loreOf(key, locale)!;
          return (
            <li key={key} className="min-w-0">
              <button
                type="button"
                onClick={() => onOpen(key)}
                aria-label={t('world.open', { name: lore.name })}
                className={`${PANEL} flex h-full w-full flex-col items-center gap-3 p-4 text-center transition-colors hover:border-[#5E574E] ${FOCUS}`}
              >
                <TeraPortrait avatarKey={key} tier={tier} size={solo ? 'xl' : 'md'} art={solo ? 'full' : 'chip'} />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="break-words [font:700_20px_'Barlow_Condensed'] uppercase leading-none text-[#F4EDE2]">{lore.name}</span>
                  <span className="break-words [font:400_12px_Inter] leading-snug text-[#A0978A]">{lore.epithet}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
