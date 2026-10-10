import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { WORLD_LORE } from '@/content/teraLore';
import { FOCUS, LABEL } from './worldStyles';

export function WorldHero() {
  const { t, locale, toggleLocale } = useI18n();
  const world = WORLD_LORE(locale);
  return (
    <header className="flex flex-col gap-8" data-testid="world-hero">
      <div className="flex items-center justify-between gap-3">
        <Link to="/" className={`${LABEL} rounded text-[#A0978A] hover:text-[#F4EDE2] ${FOCUS}`}>{t('world.back')}</Link>
        <button type="button" onClick={toggleLocale} className={`${LABEL} min-h-11 rounded-full border border-[#2E2A25] px-4 text-[#C9BFB0] hover:border-[#5E574E] ${FOCUS}`}>
          {t('locale.switch')}
        </button>
      </div>
      <div className="flex flex-col-reverse items-start gap-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-4">
          <span className={`${LABEL} text-[#3FD17F]`}>{t('world.pageLabel')}</span>
          <h1 className="break-words [font:700_clamp(56px,14vw,120px)_'Barlow_Condensed'] uppercase leading-[.85] tracking-[.01em]">{world.name}</h1>
          <p className="max-w-[28ch] [font:600_clamp(20px,4vw,28px)_Inter] leading-snug text-[#F4EDE2]">{world.tagline}</p>
          <a
            href="#cast"
            className={`mt-2 inline-flex min-h-12 items-center rounded-[12px] border-b-[5px] border-[#249457] bg-[#3FD17F] px-5 [font:700_15px_Inter] text-[#0A0908] hover:bg-[#5BE095] ${FOCUS}`}
          >
            {t('world.cta')}
          </a>
        </div>
        <img src="/mascot/tera-happy.webp" alt="" draggable={false} className="h-40 w-40 shrink-0 rounded-full bg-[#141210] object-cover ring-2 ring-[#3FD17F] sm:h-56 sm:w-56" />
      </div>
    </header>
  );
}
