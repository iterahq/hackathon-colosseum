import { FOCUS_PAID_TERAS_OFF } from '@/config/focus';
import { LABEL } from '@/components/world/worldStyles';
import { useI18n } from '@/i18n';

/** Who pays, in two lines: free for learners, sponsors lock SOL, the shop helps and Itera's server moves the share in the open. */
export function LandingModel() {
  const { t } = useI18n();
  return (
    <section className="flex flex-col gap-2 border-t border-[#262320] pt-6" data-testid="landing-model">
      <span className={`${LABEL} text-[#9B8CFF]`}>{t('landing.model.label')}</span>
      <p className="max-w-[72ch] [font:400_15px/1.55_Inter] text-[#C9BFB0]">{t(FOCUS_PAID_TERAS_OFF ? 'landing.model.lineNoShop' : 'landing.model.line')}</p>
      <p className="[font:500_13px/1.5_Inter] text-[#A0978A]" data-testid="landing-model-build">
        {t('landing.model.build')}
      </p>
    </section>
  );
}
