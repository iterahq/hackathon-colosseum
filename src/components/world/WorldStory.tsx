import { WORLD_LORE } from '@/content/teraLore';
import { useI18n } from '@/i18n';
import { H2, LABEL, PANEL } from './worldStyles';

/** The world text, the founding legend, the places and the rules. */
export function WorldStory() {
  const { t, locale } = useI18n();
  const world = WORLD_LORE(locale);
  return (
    <>
      <section className="flex flex-col gap-6" aria-label={world.name}>
        <p className="max-w-[62ch] [font:400_17px_Inter] leading-[1.7] text-[#C9BFB0]">{world.text}</p>
        <figure className="m-0 rounded-[14px] border-l-4 border-[#3FD17F] bg-[#141210] p-5 sm:p-7">
          <figcaption className={`${LABEL} mb-3 text-[#3FD17F]`}>{t('world.legend')}</figcaption>
          <blockquote className="m-0 max-w-[62ch] [font:500_18px_Inter] italic leading-[1.7] text-[#F4EDE2]">{world.legend}</blockquote>
        </figure>
      </section>
      <section className="flex flex-col gap-4" aria-labelledby="world-places">
        <h2 id="world-places" className={H2}>{t('world.places')}</h2>
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {world.places.map((p, i) => (
            <li key={p.name} className={`${PANEL} flex flex-col gap-2 p-5`}>
              <span className={`${LABEL} text-[#A0978A]`}>{String(i + 1).padStart(2, '0')}</span>
              <h3 className="m-0 [font:700_24px_'Barlow_Condensed'] uppercase leading-none">{p.name}</h3>
              <p className="m-0 [font:400_14px_Inter] leading-relaxed text-[#C9BFB0]">{p.text}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-4" aria-labelledby="world-rules">
        <h2 id="world-rules" className={H2}>{t('world.rules')}</h2>
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {world.rules.map((r, i) => (
            <li key={r} className="flex gap-4 border-b border-[#262320] py-3">
              <span className="w-6 shrink-0 [font:700_20px_'Barlow_Condensed'] text-[#3FD17F]">{i + 1}</span>
              <span className="min-w-0 [font:500_15px_Inter] leading-relaxed text-[#F4EDE2]">{r}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
