import { Link } from 'react-router-dom';
import { FOCUS } from '@/components/world/worldStyles';
import { FOCUS_BUILD, FOCUS_EARN_STORY_OFF } from '@/config/focus';
import { useI18n } from '@/i18n';
import { PITCH_VIDEO_URL, VERIFY_PAGE_LIVE, VERIFY_PATH } from './landingFacts';

export function LandingFooter() {
  const { t } = useI18n();
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#262320] pt-6 [font:500_12px_JetBrains_Mono] text-[#A0978A]">
      <span>{t('landing.foot.devnet')}</span>
      <span className="flex flex-wrap gap-4">
        {VERIFY_PAGE_LIVE && !FOCUS_EARN_STORY_OFF && (
          <Link to={VERIFY_PATH} className={`hover:text-[#F4EDE2] ${FOCUS}`} data-testid="landing-foot-verify">
            {t('landing.foot.verify')}
          </Link>
        )}
        {PITCH_VIDEO_URL && (
          <a href={PITCH_VIDEO_URL} target="_blank" rel="noreferrer" className={`hover:text-[#F4EDE2] ${FOCUS}`} data-testid="landing-foot-video">
            {t('landing.team.video')}
          </a>
        )}
        {!FOCUS_EARN_STORY_OFF && (
          <Link to="/bounties" className={`hover:text-[#F4EDE2] ${FOCUS}`}>
            {t('landing.foot.bounties')}
          </Link>
        )}
        {!FOCUS_BUILD && (
          <Link to="/world" className={`hover:text-[#F4EDE2] ${FOCUS}`}>
            {t('landing.foot.world')}
          </Link>
        )}
      </span>
    </footer>
  );
}
