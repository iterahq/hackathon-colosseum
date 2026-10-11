import { Link } from 'react-router-dom';
import { Logo } from '@/components/branded/Logo';
import { FOCUS, LABEL } from '@/components/world/worldStyles';
import { useI18n } from '@/i18n';
import { PILL } from './landingStyles';

export function LandingHeader() {
  const { t, toggleLocale } = useI18n();
  return (
    <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-3 px-4 py-5 sm:px-8">
      <Logo size={30} />
      <div className="flex items-center gap-2">
        <button type="button" onClick={toggleLocale} className={`${LABEL} ${PILL} text-[#C9BFB0] ${FOCUS}`} data-testid="landing-locale">
          {t('locale.switch')}
        </button>
        <Link to="/login" className={`${LABEL} ${PILL} text-[#F4EDE2] ${FOCUS}`} data-testid="landing-signin">
          {t('landing.cta.signIn')}
        </Link>
      </div>
    </header>
  );
}
