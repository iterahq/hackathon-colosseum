import { LABEL, PANEL } from '@/components/world/worldStyles';
import { useI18n } from '@/i18n';

/** Who pays, in one honest block: what is free, what is paid, where Itera's cut comes from, and what this build charges (nothing). */
export function LandingModel() {
  const { t } = useI18n();
  return (
    <section className={`${PANEL} flex flex-col gap-3 p-6`} data-testid="landing-model">
      <span className={`${LABEL} text-[#9B8CFF]`}>{t('landing.model.label')}</span>
      <h2 className="[font:700_28px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">{t('landing.model.title')}</h2>
      <ul className="grid list-none gap-2 p-0 md:grid-cols-3">
        {(['learners', 'shop', 'sponsors'] as const).map((key) => (
          <li key={key} className="flex flex-col gap-1 rounded-[10px] border border-[#262320] bg-[#0A0908] p-4">
            <span className="[font:700_15px_Inter] text-[#F4EDE2]">{t(`landing.model.${key}.title`)}</span>
            <span className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t(`landing.model.${key}.body`)}</span>
          </li>
        ))}
      </ul>
      <p className="[font:500_13px/1.5_Inter] text-[#A0978A]" data-testid="landing-model-build">
        {t('landing.model.build')}
      </p>
    </section>
  );
}
