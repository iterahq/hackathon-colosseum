import { TIER_LORE, loreKeysOfTier, loreOf, type LoreTier } from '@/content/teraLore';
import { useI18n } from '@/i18n';
import { TeraPortrait } from './TeraPortrait';
import { FOCUS, H2, PANEL } from './worldStyles';

export function TierSection({ tier, onOpen }: { tier: LoreTier; onOpen: (key: string) => void }) {
  const { t, locale } = useI18n();
  const info = TIER_LORE(tier, locale);
  const keys = loreKeysOfTier(tier);
  return (
    <section className="flex flex-col gap-4" aria-labelledby={`world-tier-${tier}`} data-testid={`world-tier-${tier}`}>
      <div>
        <h3 id={`world-tier-${tier}`} className={H2}>{info.name}</h3>
        <p className="mt-2 max-w-[62ch] [font:400_14px_Inter] leading-relaxed text-[#A0978A]">{info.text}</p>
      </div>
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
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
                <TeraPortrait avatarKey={key} tier={tier} />
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
