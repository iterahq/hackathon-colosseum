import { Link } from 'react-router-dom';
import { FOCUS, LABEL } from '@/components/world/worldStyles';
import { TRY_PATH } from '@/consts/guestLesson';
import { useI18n } from '@/i18n';
import { EXAMPLE_WALLET, PRIMARY_CTA, SECONDARY_CTA } from './landingStyles';

export function LandingHero() {
  const { t } = useI18n();
  return (
    <section className="flex flex-col-reverse items-start gap-8 md:flex-row md:items-center md:justify-between" data-testid="landing-hero">
      <div className="flex min-w-0 flex-col gap-5">
        <span className={`${LABEL} text-[#3FD17F]`}>{t('landing.eyebrow')}</span>
        <h1 className="[font:700_clamp(52px,11vw,112px)/0.9_'Barlow_Condensed'] uppercase tracking-[.01em]">
          <span className="block">{t('landing.h1.learn')}</span>
          <span className="block text-[#3FD17F]">{t('landing.h1.prove')}</span>
          <span className="block">{t('landing.h1.earn')}</span>
        </h1>
        <p className="max-w-[46ch] [font:500_clamp(17px,2.2vw,21px)/1.45_Inter] text-[#C9BFB0]">{t('landing.lede')}</p>
        <div className="mt-1 flex flex-wrap gap-3">
          <Link to="/login" className={`${PRIMARY_CTA} ${FOCUS}`} data-testid="landing-cta-wallet">
            {t('landing.cta.wallet')}
          </Link>
          <Link to={TRY_PATH} className={`${SECONDARY_CTA} ${FOCUS}`} data-testid="landing-cta-try">
            {t('landing.cta.try')}
          </Link>
          <Link to={`/u/${EXAMPLE_WALLET}`} className={`${SECONDARY_CTA} ${FOCUS}`} data-testid="landing-cta-profile">
            {t('landing.cta.profile')}
          </Link>
        </div>
      </div>
      <img
        src="/mascot/tera-happy.webp"
        alt=""
        draggable={false}
        className="h-36 w-36 shrink-0 rounded-full bg-[#141210] object-cover ring-2 ring-[#3FD17F] sm:h-52 sm:w-52 md:h-64 md:w-64"
      />
    </section>
  );
}
