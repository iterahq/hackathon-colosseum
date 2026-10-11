import { Link } from 'react-router-dom';
import { FOCUS } from '@/components/world/worldStyles';
import { useI18n } from '@/i18n';

export function LandingFooter() {
  const { t } = useI18n();
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#262320] pt-6 [font:500_12px_JetBrains_Mono] text-[#A0978A]">
      <span>{t('landing.foot.devnet')}</span>
      <span className="flex gap-4">
        <Link to="/bounties" className={`hover:text-[#F4EDE2] ${FOCUS}`}>
          {t('landing.foot.bounties')}
        </Link>
        <Link to="/world" className={`hover:text-[#F4EDE2] ${FOCUS}`}>
          {t('landing.foot.world')}
        </Link>
      </span>
    </footer>
  );
}
