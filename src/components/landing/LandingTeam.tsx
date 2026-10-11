import { FOCUS, LABEL } from '@/components/world/worldStyles';
import { useI18n } from '@/i18n';
import { DEVFELLOWSHIP_URL, TEAM } from './landingFacts';

/** Who built it, in one line: the two names, their roles and the community, with its link. */
export function LandingTeam() {
  const { t } = useI18n();
  const [samuel, tainan] = TEAM;
  return (
    <section className="flex flex-col gap-2" data-testid="landing-team">
      <span className={`${LABEL} text-[#A0978A]`}>{t('landing.team.label')}</span>
      <p className="max-w-[72ch] [font:400_15px/1.55_Inter] text-[#C9BFB0]">
        <span data-testid="landing-team-member">{t('landing.team.line', { samuel: samuel.name, tainan: tainan.name })}</span>{' '}
        <a href={DEVFELLOWSHIP_URL} target="_blank" rel="noreferrer" className={`underline underline-offset-2 hover:text-[#F4EDE2] ${FOCUS}`}>
          devfellowship.com
        </a>
        .
      </p>
    </section>
  );
}
