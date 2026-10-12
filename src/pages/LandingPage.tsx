import { LandingSkills } from '@/components/landing/LandingSkills';
import { FOCUS_EARN_STORY_OFF, FOCUS_PAID_TERAS_OFF } from '@/config/focus';
import { LandingEarnSteps } from '@/components/landing/LandingEarnSteps';
import { LandingExample } from '@/components/landing/LandingExample';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { LandingHero } from '@/components/landing/LandingHero';
import { LandingLiveStats } from '@/components/landing/LandingLiveStats';
import { LandingModel } from '@/components/landing/LandingModel';
import { LandingStep } from '@/components/landing/LandingStep';
import { LandingStory } from '@/components/landing/LandingStory';
import { LandingTeam } from '@/components/landing/LandingTeam';
import { LABEL, WORLD_GRID } from '@/components/world/worldStyles';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTeraCatalog } from '@/hooks/useTeraCatalog';
import { useI18n } from '@/i18n';

/** The public landing at "/" for a visitor with no session: learn, prove, own; then what is next, numbers read live, who pays and who built it. */
export default function LandingPage() {
  const { t } = useI18n();
  usePageTitle(t('landing.title'));
  // Said only once the catalog answers that some tiers are never for sale.
  const catalog = useTeraCatalog();
  const earnOnly = catalog.source === 'live' && catalog.tiers.some((tier) => tier.earnOnly);
  const ownBody = FOCUS_PAID_TERAS_OFF ? t('landing.step.own.bodyNoShop') : earnOnly ? `${t('landing.step.own.body')} ${t('landing.step.own.rare')}` : t('landing.step.own.body');
  const proveBody = !FOCUS_EARN_STORY_OFF && earnOnly ? `${t('landing.step.prove.body')} ${t(FOCUS_PAID_TERAS_OFF ? 'landing.step.prove.chestOnly' : 'landing.step.prove.chest')}` : t('landing.step.prove.body');
  return (
    <div className="min-h-screen text-[#F4EDE2]" style={WORLD_GRID} data-testid="landing">
      <LandingHeader />
      <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-14 px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
        <LandingHero />
        {!FOCUS_EARN_STORY_OFF && <LandingStory />}
        <ol className="grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-4" data-testid="landing-steps">
          <LandingStep label={t('landing.step.learn.label')} title={t('landing.step.learn.title')} body={t('landing.step.learn.body')} accent="#3FD17F" />
          <LandingStep label={t('landing.step.prove.label')} title={t('landing.step.prove.title')} body={proveBody} accent="#F2C94C">
            <LandingSkills kind="proven" />
          </LandingStep>
          {FOCUS_EARN_STORY_OFF ? (
            <>
              <LandingStep label={t('landing.step.own.label')} title={t('landing.step.own.title')} body={ownBody} accent="#9B8CFF" />
              <LandingStep label={t('landing.step.next.label')} title={t('landing.step.next.title')} body={t('landing.step.next.body')} accent="#5FB8FF" />
            </>
          ) : (
            <LandingEarnSteps />
          )}
        </ol>
        <section className="flex flex-col gap-4" data-testid="landing-live">
          <span className={`${LABEL} text-[#A0978A]`}>{t('landing.live.label')}</span>
          <LandingLiveStats />
          <LandingExample />
        </section>
        <LandingModel />
        <LandingTeam />
        <LandingFooter />
      </main>
    </div>
  );
}
