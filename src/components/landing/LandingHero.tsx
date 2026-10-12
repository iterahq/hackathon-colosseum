import { Link, useNavigate } from 'react-router-dom';
import { ConnectWalletButton } from '@/components/header/ConnectWalletButton';
import { FOCUS, LABEL } from '@/components/world/worldStyles';
import { FOCUS_EARN_STORY_OFF } from '@/config/focus';
import { TRY_PATH } from '@/consts/guestLesson';
import { useI18n } from '@/i18n';
import { GATE_PATH, VERIFY_PATH } from './landingFacts';
import { EXAMPLE_WALLET, PRIMARY_CTA, SECONDARY_CTA } from './landingStyles';

export function LandingHero() {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <section className="flex flex-col-reverse items-start gap-8 md:flex-row md:items-center md:justify-between" data-testid="landing-hero">
      <div className="flex min-w-0 flex-col gap-5">
        <span className={`${LABEL} text-[#3FD17F]`}>{t('landing.eyebrow')}</span>
        <h1 className="[font:700_clamp(52px,11vw,112px)/0.9_'Barlow_Condensed'] uppercase tracking-[.01em]">
          <span className="block">{t('landing.h1.learn')}</span>
          <span className="block text-[#3FD17F]">{t('landing.h1.prove')}</span>
          <span className="block">{t(FOCUS_EARN_STORY_OFF ? 'landing.h1.own' : 'landing.h1.earn')}</span>
        </h1>
        <p className="max-w-[46ch] [font:500_clamp(17px,2.2vw,21px)/1.45_Inter] text-[#C9BFB0]" data-testid="landing-lede">{t('landing.lede')}</p>
        {!FOCUS_EARN_STORY_OFF && (
          <p className="max-w-[52ch] [font:500_15px/1.5_Inter] text-[#C9BFB0]" data-testid="landing-hero-found">
            {t('landing.hero.found')}{' '}
            <Link to="/talent" className={`rounded text-[#F4EDE2] underline underline-offset-4 hover:text-[#3FD17F] ${FOCUS}`} data-testid="landing-hero-talent">
              {t('landing.hero.talent')}
            </Link>
          </p>
        )}
        <div className="mt-1 flex flex-wrap gap-3">
          {/* The same action as the header: Phantom in the browser signs in on the click; without it, the sign-in page says how to get it. */}
          <ConnectWalletButton
            className={`${PRIMARY_CTA} disabled:opacity-60 ${FOCUS}`}
            testId="landing-cta-wallet"
            onError={() => navigate('/login')}
            fallback={
              <Link to="/login" className={`${PRIMARY_CTA} ${FOCUS}`} data-testid="landing-cta-wallet">
                {t('landing.cta.signIn')}
              </Link>
            }
          />
          <Link to={TRY_PATH} className={`${SECONDARY_CTA} ${FOCUS}`} data-testid="landing-cta-try">
            {t('landing.cta.try')}
          </Link>
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 [font:600_13px_JetBrains_Mono] text-[#A0978A]" data-testid="landing-hero-links">
          <Link to={`/u/${EXAMPLE_WALLET}`} className={`inline-flex min-h-11 items-center rounded underline underline-offset-4 hover:text-[#F4EDE2] ${FOCUS}`} data-testid="landing-cta-profile">
            {t('landing.cta.profile')} →
          </Link>
          {!FOCUS_EARN_STORY_OFF && (
            <>
              <Link to={VERIFY_PATH} className={`inline-flex min-h-11 items-center rounded hover:text-[#F4EDE2] ${FOCUS}`} data-testid="landing-verify">
                {t('landing.hero.verify')} →
              </Link>
              <Link to="/bounties" className={`inline-flex min-h-11 items-center rounded hover:text-[#F4EDE2] ${FOCUS}`} data-testid="landing-hero-bounties">
                {t('landing.hero.bounties')} →
              </Link>
              <Link to={GATE_PATH} className={`inline-flex min-h-11 items-center rounded hover:text-[#F4EDE2] ${FOCUS}`} data-testid="landing-cta-gate">
                {t('landing.cta.gate')} →
              </Link>
            </>
          )}
        </p>
      </div>
      <img
        src="/mascot/tera-hero.webp"
        alt=""
        draggable={false}
        width={640}
        height={640}
        className="h-40 w-40 shrink-0 object-contain sm:h-56 sm:w-56 md:h-72 md:w-72"
      />
    </section>
  );
}
