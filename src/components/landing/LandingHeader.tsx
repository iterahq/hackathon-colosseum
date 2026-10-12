import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/branded/Logo';
import { ConnectWalletButton } from '@/components/header/ConnectWalletButton';
import { HeaderLocale } from '@/components/header/HeaderLocale';
import { FOCUS, LABEL } from '@/components/world/worldStyles';
import { useI18n } from '@/i18n';

const CONNECT = `${LABEL} inline-flex min-h-11 items-center rounded-full border-b-[3px] border-[#249457] bg-[#3FD17F] px-5 text-[#0A0908] hover:bg-[#5BE095] disabled:opacity-60 ${FOCUS}`;

export function LandingHeader() {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-3 px-4 py-5 sm:px-8">
      <Logo size={30} />
      <div className="flex items-center gap-2">
        <HeaderLocale size="lg" />
        {/* Phantom in the browser: one click signs in and "/" becomes the learner home. Without it, the sign-in page says how to get it. */}
        <ConnectWalletButton
          className={CONNECT}
          testId="landing-signin"
          onError={() => navigate('/login')}
          fallback={
            <Link to="/login" className={CONNECT} data-testid="landing-signin">
              {t('landing.cta.signIn')}
            </Link>
          }
        />
      </div>
    </header>
  );
}
