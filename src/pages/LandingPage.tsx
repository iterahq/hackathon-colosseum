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
import { useI18n } from '@/i18n';

/** The public landing at "/" for a visitor with no session: the thesis, who it is for, how it works, who pays, who built it, numbers read live. */
export default function LandingPage() {
  const { t } = useI18n();
  usePageTitle(t('landing.title'));
  return (
    <div className="min-h-screen text-[#F4EDE2]" style={WORLD_GRID} data-testid="landing">
      <LandingHeader />
      <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-14 px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
        <LandingHero />
        <LandingStory />
        <ol className="grid list-none gap-4 p-0 md:grid-cols-3" data-testid="landing-steps">
          <LandingStep label={t('landing.step.learn.label')} title={t('landing.step.learn.title')} body={t('landing.step.learn.body')} accent="#3FD17F" />
          <LandingStep label={t('landing.step.prove.label')} title={t('landing.step.prove.title')} body={t('landing.step.prove.body')} accent="#F2C94C" />
          <LandingStep label={t('landing.step.earn.label')} title={t('landing.step.earn.title')} body={t('landing.step.earn.body')} accent="#9B8CFF" />
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
