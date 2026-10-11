import { Link } from 'react-router-dom';
import { FOCUS, LABEL, PANEL } from '@/components/world/worldStyles';
import { useI18n } from '@/i18n';
import { DEVFELLOWSHIP_URL, PITCH_VIDEO_URL, TEAM, VERIFY_PAGE_LIVE, VERIFY_PATH } from './landingFacts';
import { SECONDARY_CTA } from './landingStyles';

/** Who built it, with the pitch video and the verification page beside it when they exist. */
export function LandingTeam() {
  const { t } = useI18n();
  return (
    <section className={`${PANEL} flex flex-col gap-4 p-6`} data-testid="landing-team">
      <span className={`${LABEL} text-[#A0978A]`}>{t('landing.team.label')}</span>
      <div className="grid gap-4 md:grid-cols-2">
        {TEAM.map((member) => (
          <div key={member.name} className="flex flex-col gap-1" data-testid="landing-team-member">
            <span className="[font:700_20px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">{member.name}</span>
            <span className="[font:600_12px_JetBrains_Mono] uppercase tracking-[.08em] text-[#3FD17F]">{t(member.roleKey)}</span>
            <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t(member.bioKey)}</p>
          </div>
        ))}
      </div>
      <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">
        {t('landing.team.community')}{' '}
        <a href={DEVFELLOWSHIP_URL} target="_blank" rel="noreferrer" className={`underline underline-offset-2 hover:text-[#F4EDE2] ${FOCUS}`}>
          devfellowship.com
        </a>
      </p>
      {(PITCH_VIDEO_URL || VERIFY_PAGE_LIVE) && (
        <div className="flex flex-wrap gap-3">
          {PITCH_VIDEO_URL && (
            <a href={PITCH_VIDEO_URL} target="_blank" rel="noreferrer" className={`${SECONDARY_CTA} ${FOCUS}`} data-testid="landing-pitch-video">
              {t('landing.team.video')}
            </a>
          )}
          {VERIFY_PAGE_LIVE && (
            <Link to={VERIFY_PATH} className={`${SECONDARY_CTA} ${FOCUS}`} data-testid="landing-verify">
              {t('landing.team.verify')}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
