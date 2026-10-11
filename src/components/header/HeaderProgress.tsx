import { Link } from 'react-router-dom';
import { useProgressStory } from '@/hooks/useProgressStory';
import { useI18n } from '@/i18n';
import { HeaderIcon } from './HeaderIcon';

/**
 * The header leads with the progress story: days stamped, in its short form; the capabilities proven sit in
 * the chip's title and aria-label and, in full, first on the dashboard's welcome strip. Hidden between 1024
 * and 1439 px, where the six tabs, the search and the pills already fill the bar. Opens the certifications page.
 */
const SHOW = 'hidden md:flex lg:hidden min-[1440px]:flex';
export function HeaderProgress() {
  const { t } = useI18n();
  const story = useProgressStory();
  if (story.pending && story.daysTotal === 0) {
    return <span aria-hidden data-testid="header-progress-loading" className={`${SHOW} h-11 w-[150px] animate-pulse rounded-full border border-[#262320] bg-[#141210] motion-reduce:animate-none`} />;
  }
  const days = t(story.wallet ? 'header.progress.days' : 'header.progress.daysNoWallet', { n: story.wallet ? story.daysStamped : story.daysDone, total: story.daysTotal });
  const pending = story.wallet && story.daysPending > 0 ? t(`header.progress.pending${story.daysPending === 1 ? '' : '.other'}`, { n: story.daysPending }) : null;
  const proven = story.verified != null && story.capabilitiesTotal != null ? t('header.progress.proven', { n: story.verified, total: story.capabilitiesTotal }) : null;
  const label = [days, pending, proven].filter(Boolean).join(' · ');
  const short = t(story.wallet ? 'header.progress.short' : 'header.progress.shortNoWallet', { n: story.wallet ? story.daysStamped : story.daysDone, total: story.daysTotal });
  return (
    <Link
      to="/passport"
      aria-label={label}
      title={label}
      data-testid="header-progress"
      data-days={story.wallet ? story.daysStamped : story.daysDone}
      data-pending={story.daysPending}
      data-proven={story.verified ?? ''}
      className={`${SHOW} hd-focus h-11 items-center gap-2 rounded-full border border-[#262320] bg-[#141210] px-3 [font:700_12px_JetBrains_Mono] tabular-nums text-[#F4EDE2] transition-colors hover:bg-[#1B1815]`}
    >
      <HeaderIcon name="passport" size={16} className="text-[#3FD17F]" />
      <span className="whitespace-nowrap">{short}</span>
    </Link>
  );
}
