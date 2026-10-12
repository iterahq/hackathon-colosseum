import { useBountyBoard } from '@/hooks/useBounties';
import { useI18n } from '@/i18n';
import { LandingSkills } from './LandingSkills';
import { LandingStep } from './LandingStep';

/** Steps 03 and 04 of a build that tells the bounty story (`FOCUS_EARN_STORY_OFF` false): earn, and be found. */
export function LandingEarnSteps() {
  const { t } = useI18n();
  const older = (useBountyBoard().data?.stats.daysByAttesterCount ?? 0) > 0;
  return (
    <>
      <LandingStep label={t('landing.step.earn.label')} title={t('landing.step.earn.title')} body={older ? `${t('landing.step.earn.body')} ${t('landing.step.earn.older')}` : t('landing.step.earn.body')} accent="#9B8CFF">
        <LandingSkills kind="gate" />
      </LandingStep>
      <LandingStep label={t('landing.step.found.label')} title={t('landing.step.found.title')} body={t('landing.step.found.body')} accent="#5FB8FF" link={{ to: '/talent', label: t('landing.step.found.link') }} />
    </>
  );
}
