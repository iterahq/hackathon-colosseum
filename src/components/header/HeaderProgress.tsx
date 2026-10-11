import { Link } from 'react-router-dom';
import { useProgressStory } from '@/hooks/useProgressStory';
import { useI18n } from '@/i18n';
import { HeaderIcon } from './HeaderIcon';

/** The header leads with the progress story: days stamped, capabilities proven. Opens the certifications page. */
export function HeaderProgress() {
  const { t } = useI18n();
  const story = useProgressStory();
  if (story.pending && story.daysTotal === 0) {
    return <span aria-hidden data-testid="header-progress-loading" className="hidden h-11 w-[150px] animate-pulse rounded-full border border-[#262320] bg-[#141210] motion-reduce:animate-none md:block" />;
  }
  const days = t(story.wallet ? 'header.progress.days' : 'header.progress.daysNoWallet', { n: story.daysDone, total: story.daysTotal });
  const proven = story.verified != null && story.capabilitiesTotal != null ? t('header.progress.proven', { n: story.verified, total: story.capabilitiesTotal }) : null;
  const label = proven ? `${days} · ${proven}` : days;
  return (
    <Link
      to="/passport"
      aria-label={label}
      title={label}
      data-testid="header-progress"
      data-days={story.daysDone}
      data-proven={story.verified ?? ''}
      className="hd-focus hidden h-11 items-center gap-2 rounded-full border border-[#262320] bg-[#141210] px-3 [font:700_13px_JetBrains_Mono] tabular-nums text-[#F4EDE2] transition-colors hover:bg-[#1B1815] md:flex"
    >
      <HeaderIcon name="passport" size={16} className="text-[#3FD17F]" />
      <span>{days}</span>
      {proven && (
        <>
          <span aria-hidden className="h-4 w-px bg-[#2E2A25]" />
          <span className="text-[#C9BFB0]">{proven}</span>
        </>
      )}
    </Link>
  );
}
