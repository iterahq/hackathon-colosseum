import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { BountyOpening } from '@/types/loop';

/** The bounty this wallet may accept now and an automatic check pays: one button, straight to it. */
export function InstantBountyLink({ opening }: { opening: BountyOpening }) {
  const { t } = useI18n();
  const { bounty } = opening;
  return (
    <Link
      to={`/bounties/${bounty.slug}`}
      className="flex min-h-12 items-center gap-3 rounded-[12px] bg-[#3FD17F] px-4 py-3 text-[#0A0908] hover:bg-[#5BE095] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3FD17F]"
      data-testid="loop-instant"
      data-slug={bounty.slug}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="[font:700_18px/1.15_'Barlow_Condensed']">{t('loop.instant.title', { title: bounty.title })}</span>
        <span className="[font:600_12px/1.35_Inter]">{t('loop.instant.body', { reward: bounty.rewardSol })}</span>
      </span>
      <ArrowRight size={20} className="shrink-0" aria-hidden />
    </Link>
  );
}
