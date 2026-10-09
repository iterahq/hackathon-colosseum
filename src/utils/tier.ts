type T = (key: string) => string;

const TIERS = new Set(['bronze', 'silver', 'gold']);

/** "gold" -> "ouro" / "gold" through the i18n modules; an unknown tier is shown as it came. */
export const tierLabel = (t: T, tier: string): string => (TIERS.has(tier.toLowerCase()) ? t(`tier.${tier.toLowerCase()}`) : tier);
