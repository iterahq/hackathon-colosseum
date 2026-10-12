import { useTeraCatalog } from '@/hooks/useTeraCatalog';
import { useI18n } from '@/i18n';

/** How a Tera of an earn-only tier is earned, in the catalog's own words; a general line while the catalog has none. */
export function EarnHow({ rarity }: { rarity: string | null }) {
  const { t, locale } = useI18n();
  const how = useTeraCatalog().tiers.find((tier) => tier.rarity === rarity)?.how?.[locale];
  return <span data-testid="earn-how">{how || t('shelf.earn.chest')}</span>;
}
