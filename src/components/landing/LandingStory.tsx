import { LABEL, PANEL } from '@/components/world/worldStyles';
import { useI18n } from '@/i18n';

/** Who Itera is for and the problem it answers, in a stranger's words: no jargon, only what is true today. */
export function LandingStory() {
  const { t } = useI18n();
  return (
    <section className="grid gap-4 md:grid-cols-2" data-testid="landing-story">
      <div className={`${PANEL} flex flex-col gap-3 p-6`}>
        <span className={`${LABEL} text-[#3FD17F]`}>{t('landing.story.who.label')}</span>
        <h2 className="[font:700_28px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">{t('landing.story.who.title')}</h2>
        <p className="[font:400_15px/1.55_Inter] text-[#C9BFB0]">{t('landing.story.who.body')}</p>
      </div>
      <div className={`${PANEL} flex flex-col gap-3 p-6`}>
        <span className={`${LABEL} text-[#F2C94C]`}>{t('landing.story.problem.label')}</span>
        <h2 className="[font:700_28px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">{t('landing.story.problem.title')}</h2>
        <p className="[font:400_15px/1.55_Inter] text-[#C9BFB0]">{t('landing.story.problem.body')}</p>
      </div>
    </section>
  );
}
