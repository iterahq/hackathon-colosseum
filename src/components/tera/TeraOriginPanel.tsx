import { Link } from 'react-router-dom';
import { FOCUS_EARN_STORY_OFF } from '@/config/focus';
import { useI18n } from '@/i18n';
import { txUrl } from '@/lib/explorer';
import { chestVerifyPath } from '@/services/teraChest.service';
import type { TeraOrigin } from '@/types/tera';
import { OriginBadge } from './OriginBadge';

const LINK = 'inline-flex min-h-11 items-center rounded [font:600_13px_JetBrains_Mono] text-[#3FD17F] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]';

/** On the public page of a Tera asset: how it was obtained, in one sentence, whether it can change hands, and the links that prove it. */
export function TeraOriginPanel({ origin }: { origin: TeraOrigin }) {
  const { t } = useI18n();
  const { earned, sponsor } = origin;
  const line =
    origin.kind === 'earned'
      ? earned && earned.day > 0
        ? t('origin.card.earned', { day: earned.day, trail: earned.trail })
        : t('origin.section.earnedHint')
      : origin.kind === 'sponsor'
        ? sponsor
          ? t('origin.card.sponsor', { title: sponsor.bountyTitle, brand: sponsor.brand })
          : t('origin.section.sponsorHint')
        : t('origin.card.bought');
  return (
    <section className="flex w-full flex-col gap-2 rounded-[14px] border border-[#262320] bg-[#141210] p-4 sm:p-5" aria-labelledby="tera-origin-title" data-testid="tera-origin-panel" data-origin={origin.kind}>
      <h2 id="tera-origin-title" className="[font:700_24px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">{t('origin.card.title')}</h2>
      <OriginBadge origin={origin} />
      <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">
        {line}
        {!origin.transferable ? ` ${t('origin.card.bound')}` : ''}
      </p>
      <div className="-mb-2 flex flex-col items-start">
        {!FOCUS_EARN_STORY_OFF && earned?.chestId && (
          <Link to={chestVerifyPath(earned.chestId)} className={LINK} data-testid="tera-origin-reroll">
            {t('chest.verify')} →
          </Link>
        )}
        {earned?.certification && (
          <Link to={`/c/${earned.certification}`} className={LINK} data-testid="tera-origin-cert">
            {t('origin.card.cert')} →
          </Link>
        )}
        {!FOCUS_EARN_STORY_OFF && sponsor?.bountySlug && (
          <Link to={`/bounties/${sponsor.bountySlug}`} className={LINK} data-testid="tera-origin-bounty">
            {t('origin.card.bounty')} →
          </Link>
        )}
        {sponsor?.payoutTx && (
          <a href={txUrl(sponsor.payoutTx)} target="_blank" rel="noopener noreferrer" className={LINK}>
            {t('origin.payout')} ↗
          </a>
        )}
      </div>
    </section>
  );
}
