import { useTeraCatalog } from '@/hooks/useTeraCatalog';
import { useI18n } from '@/i18n';

/** How a Tera of an earn-only tier is earned, in the catalog's own words. Nothing while the catalog has not said: a sentence of ours could be wider than the rule. */
export function EarnHow({ rarity }: { rarity: string | null }) {
  const { locale } = useI18n();
  const how = useTeraCatalog().tiers.find((tier) => tier.rarity === rarity)?.how?.[locale];
  return how ? <span data-testid="earn-how">{how}</span> : null;
}
