import { CRYSTAL_LORE, EARN_EVENTS } from '@/content/teraLore';
import { useI18n } from '@/i18n';
import { H2, LABEL, PANEL } from './worldStyles';

export function CrystalSection() {
  const { t, locale } = useI18n();
  const crystal = CRYSTAL_LORE(locale);
  return (
    <section className={`${PANEL} flex flex-col gap-5 p-5 sm:p-8`} aria-labelledby="world-crystal" data-testid="world-crystal">
      <div className="flex flex-col gap-2">
        <span className={`${LABEL} text-[#3FD17F]`}>{t('world.crystal.label')}</span>
        <h2 id="world-crystal" className={H2}>{crystal.name}</h2>
        <p className="m-0 [font:600_18px_Inter] text-[#F4EDE2]">{crystal.line}</p>
        <p className="m-0 max-w-[62ch] [font:400_15px_Inter] leading-relaxed text-[#C9BFB0]">{crystal.text}</p>
      </div>
      <div>
        <h3 className={`${LABEL} m-0 mb-2 text-[#A0978A]`}>{t('world.crystal.earn')}</h3>
        <ul className="m-0 grid list-none grid-cols-1 gap-x-8 p-0 sm:grid-cols-2">
          {EARN_EVENTS.map((e) => (
            <li key={e} className="flex min-w-0 flex-col gap-0.5 border-b border-[#262320] py-2.5">
              <span className="[font:700_16px_'Barlow_Condensed'] uppercase tracking-[.04em] text-[#F4EDE2]">{t(`world.earn.${e}`)}</span>
              <span className="[font:400_13px_Inter] leading-snug text-[#C9BFB0]">{crystal.earn[e]}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
