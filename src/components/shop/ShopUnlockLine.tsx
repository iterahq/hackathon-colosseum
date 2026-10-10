import { useI18n } from '@/i18n';
import type { ShopUnlock } from '@/types/shop';

interface Props {
  unlock: ShopUnlock;
  failed?: boolean;
}

/** The "earned or bought" line of a shop card: how far the learner's level is from the free unlock. */
export function ShopUnlockLine({ unlock, failed = false }: Props) {
  const { t } = useI18n();
  const current = Math.min(unlock.currentLevel ?? 1, unlock.level);
  const percent = Math.round((current / unlock.level) * 100);

  if (unlock.unlocked) {
    return (
      <p className="[font:600_13px/1.4_Inter] text-[#3FD17F]" data-testid="shop-unlock" data-unlocked="true" role={failed ? 'alert' : undefined}>
        {failed ? t('shop.claim.error') : t('shop.unlock.ready', { level: unlock.level })}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-[6px]" data-testid="shop-unlock" data-unlocked="false">
      <div className="h-[6px] overflow-hidden rounded-full bg-[#262320]" role="progressbar" aria-valuemin={0} aria-valuemax={unlock.level} aria-valuenow={current}>
        <div className="h-full rounded-full bg-[#3FD17F]" style={{ width: `${percent}%` }} />
      </div>
      <p className="[font:600_13px/1.4_Inter] text-[#C9BFB0]">{t('shop.unlock.progress', { current, level: unlock.level })}</p>
    </div>
  );
}
