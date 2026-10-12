import { Award, Lock, ShoppingBag } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { ObtainWay } from './obtain';

const CHIP = 'inline-flex min-h-[24px] items-center gap-1.5 rounded-full px-2.5 [font:700_10px/1_JetBrains_Mono] uppercase tracking-[.08em]';

/** How a Tera is obtained, one chip per way: gold with a medal for study, an outline with a bag for the shop. The same two looks as the origin of a Tera someone holds. */
export function ObtainBadges({ ways, className = '' }: { ways: readonly ObtainWay[]; className?: string }) {
  const { t } = useI18n();
  if (ways.length === 0) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`} data-testid="world-obtain" data-ways={ways.join(',')}>
      {ways.includes('earn') && (
        <span className={`${CHIP} bg-[#F2C66D] text-[#0A0908]`} data-way="earn">
          <Award size={12} aria-hidden />
          {t('world.way.earn')}
        </span>
      )}
      {ways.includes('buy') && (
        <span className={`${CHIP} border border-[#5E574E] text-[#C9BFB0]`} data-way="buy">
          <ShoppingBag size={12} aria-hidden />
          {t('world.way.buy')}
        </span>
      )}
    </span>
  );
}

/** A Tera the wallet does not hold. */
export function LockedBadge({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  return (
    <span className={`${CHIP} border border-[#2E2A25] bg-[#0A0908] text-[#A0978A] ${className}`} data-testid="world-locked">
      <Lock size={11} aria-hidden />
      {t('world.locked')}
    </span>
  );
}
