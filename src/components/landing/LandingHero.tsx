import { Link } from 'react-router-dom';
import { FOCUS, LABEL } from '@/components/world/worldStyles';
import { TRY_PATH } from '@/consts/guestLesson';
import { useI18n } from '@/i18n';
import { VERIFY_PATH } from './landingFacts';
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
        <p className="max-w-[46ch] [font:500_clamp(17px,2.2vw,21px)/1.45_Inter] text-[#C9BFB0]" data-testid="landing-lede">{t('landing.lede')}</p>
        <div className="mt-1 flex flex-wrap gap-3">
          <Link to={TRY_PATH} className={`${PRIMARY_CTA} ${FOCUS}`} data-testid="landing-cta-try">
            {t('landing.cta.try')}
          </Link>
          <Link to="/login" className={`${SECONDARY_CTA} ${FOCUS}`} data-testid="landing-cta-wallet">
            {t('landing.cta.wallet')}
          </Link>
          <Link to={`/u/${EXAMPLE_WALLET}`} className={`${SECONDARY_CTA} ${FOCUS}`} data-testid="landing-cta-profile">
            {t('landing.cta.profile')}
          </Link>
        </div>
        <p className="max-w-[52ch] [font:500_14px/1.5_Inter] text-[#C9BFB0]" data-testid="landing-hero-time">
          {t('landing.hero.time')}
        </p>
        <p className="max-w-[52ch] [font:500_14px/1.5_Inter] text-[#A0978A]" data-testid="landing-cta-email-line">
          {t('landing.cta.emailLead')}{' '}
          <Link to="/signup" className={`rounded text-[#F4EDE2] underline underline-offset-4 hover:text-[#3FD17F] ${FOCUS}`} data-testid="landing-cta-email">
            {t('landing.cta.email')}
          </Link>
          {' '}
          {t('landing.cta.emailTail')}
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 [font:600_13px_JetBrains_Mono] text-[#A0978A]" data-testid="landing-hero-links">
          <Link to={VERIFY_PATH} className={`rounded hover:text-[#F4EDE2] ${FOCUS}`} data-testid="landing-verify">
            {t('landing.hero.verify')} →
          </Link>
          <Link to="/bounties" className={`rounded hover:text-[#F4EDE2] ${FOCUS}`} data-testid="landing-hero-bounties">
            {t('landing.hero.bounties')} →
          </Link>
        </p>
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
