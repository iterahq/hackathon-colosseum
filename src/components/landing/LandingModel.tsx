import { LABEL, PANEL } from '@/components/world/worldStyles';
import { useCircuit } from '@/hooks/useCircuit';
import { useI18n } from '@/i18n';
import { usd } from '@/utils/landingStats';

/** Who pays, in one honest block: what is free, what is paid, where Itera's cut comes from, and what this build charges (nothing). The shop's prices are the shop's own, read live. */
export function LandingModel() {
  const { t, locale } = useI18n();
  const shop = useCircuit(null).data?.shop ?? null;
  const shopBody = shop ? t('landing.model.shop.body', { min: usd(shop.minUsdCents, locale), max: usd(shop.maxUsdCents, locale) }) : t('landing.model.shop.bodyUnpriced');
  return (
    <section className={`${PANEL} flex flex-col gap-3 p-6`} data-testid="landing-model">
      <span className={`${LABEL} text-[#9B8CFF]`}>{t('landing.model.label')}</span>
      <h2 className="[font:700_28px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">{t('landing.model.title')}</h2>
      <ul className="grid list-none gap-2 p-0 md:grid-cols-3">
        {(['learners', 'shop', 'sponsors'] as const).map((key) => (
          <li key={key} className="flex flex-col gap-1 rounded-[10px] border border-[#262320] bg-[#0A0908] p-4" data-testid={`landing-model-${key}`}>
            <span className="[font:700_15px_Inter] text-[#F4EDE2]">{t(`landing.model.${key}.title`)}</span>
            <span className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{key === 'shop' ? shopBody : t(`landing.model.${key}.body`)}</span>
          </li>
        ))}
      </ul>
      <p className="[font:500_13px/1.5_Inter] text-[#A0978A]" data-testid="landing-model-build">
        {t('landing.model.build')}
      </p>
    </section>
  );
}
