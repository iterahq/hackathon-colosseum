import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';
import type { BountyOpening } from '@/types/loop';
import { LOOP_ROW } from './loopStyles';

export function BountyOpeningRow({ opening }: { opening: BountyOpening }) {
  const { t } = useI18n();
  const { bounty } = opening;
  return (
    <li>
      <Link to={`/bounties/${bounty.slug}`} className={`${LOOP_ROW} hover:border-[#3FD17F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]`} data-testid="loop-bounty" data-slug={bounty.slug}>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="[font:700_16px/1.15_'Barlow_Condensed'] text-[#F4EDE2]">{bounty.title}</span>
          <span className="[font:500_11px_JetBrains_Mono] text-[#A0978A]">{t('loop.opened.requires', { trail: bounty.requirement.trail, n: bounty.requirement.minDays })}</span>
        </span>
        <span className="shrink-0 [font:700_18px/1_'Barlow_Condensed'] text-[#3FD17F]">{bounty.rewardSol}</span>
      </Link>
    </li>
  );
}
