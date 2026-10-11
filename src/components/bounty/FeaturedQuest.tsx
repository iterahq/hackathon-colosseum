import { Link } from 'react-router-dom';
import { TeraAvatar } from '@iterahq/activities';
import { JudgeCaption, JudgeChip } from '@/components/bounty/JudgeParts';
import { Reward } from '@/components/bounty/bountyUi';
import { BTN_PRIMARY, FOCUS, MONO_LABEL } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';
import type { Bounty } from '@/types/bounty';

function SlotPips({ total, free }: { total: number; free: number }) {
  return (
    <span className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={`h-2.5 w-2.5 rounded-full border ${index < free ? 'border-[#3FD17F] bg-[#3FD17F]' : 'border-[#5E574E]'}`} />
      ))}
    </span>
  );
}

export function FeaturedQuest({ bounty }: { bounty: Bounty }) {
  const { t } = useI18n();
  const judge = bounty.judge;
  const total = judge?.slotCount ?? 0;
  const free = Math.max(0, Math.min(total, judge?.openCount ?? 0));
  return (
    <Link
      to={`/bounties/${bounty.slug}`}
      className={`group flex w-full min-w-0 flex-wrap items-center gap-4 sm:flex-nowrap rounded-[14px] border-2 border-[#F2C66D] bg-[#141210] p-4 transition-transform motion-safe:hover:-translate-y-0.5 sm:p-5 ${FOCUS}`}
      data-testid="bounty-card"
    >
      <div className="hidden shrink-0 sm:block">
        <TeraAvatar mood="happy" size="sm" />
      </div>
      <div className="flex min-w-0 basis-full flex-col gap-2 sm:basis-0 sm:flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${MONO_LABEL} text-[#F2C66D]`}>{t('bounty.featured.label')}</span>
          {judge && <JudgeChip />}
          {total >= 2 && <SlotPips total={total} free={free} />}
        </div>
        <h2 className="line-clamp-2 [font:700_28px/1.05_'Barlow_Condensed'] text-[#F4EDE2] [overflow-wrap:anywhere] max-sm:text-[24px]">{bounty.title}</h2>
        <Reward sol={bounty.rewardSol} />
        {judge && <JudgeCaption judge={judge} needsLine />}
      </div>
      <span className={`${BTN_PRIMARY} shrink-0 max-sm:w-full`}>{t('bounty.featured.cta')}</span>
    </Link>
  );
}
