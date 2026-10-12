import { Link } from 'react-router-dom';
import { loreTierOf, type TierMap } from '@/content/teraLore';
import { useI18n } from '@/i18n';
import type { OwnedTeras } from './obtain';
import { TeraCard } from './TeraCard';
import { FOCUS, LABEL, PANEL } from './worldStyles';

/** The Teras this wallet holds, right under the hero: what was just earned or bought is seen first, and one link goes down to the whole cast, where every other one is locked. */
export function WorldCollection({ owned, keys, avatars, onOpen }: { owned: OwnedTeras; keys: readonly string[]; avatars?: TierMap; onOpen: (key: string) => void }) {
  const { t } = useI18n();
  const mine = keys.filter((key) => key in owned);
  return (
    <section className={`${PANEL} flex flex-col gap-4 p-4 sm:p-5`} aria-labelledby="world-collection" data-testid="world-collection" data-unlocked={mine.length}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id="world-collection" className="[font:700_26px/1_'Barlow_Condensed'] uppercase tracking-[.02em] text-[#F4EDE2]">{t('world.collection.title')}</h3>
        <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className={`${LABEL} text-[#3FD17F]`} data-testid="world-collection-count">{t('world.collection.count', { n: mine.length, total: keys.length })}</span>
          <a href="#cast" className={`${LABEL} rounded text-[#A0978A] underline-offset-2 hover:text-[#F4EDE2] hover:underline ${FOCUS}`} data-testid="world-collection-all">{t('world.collection.all')} ↓</a>
        </span>
      </div>
      {mine.length === 0 ? (
        <p className="[font:500_14px/1.5_Inter] text-[#C9BFB0]">
          {t('world.collection.empty')}{' '}
          <Link to="/" className={`rounded text-[#3FD17F] underline-offset-2 hover:underline ${FOCUS}`}>{t('world.collection.start')}</Link>
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {mine.map((key) => (
            <li key={key} className="min-w-0">
              <TeraCard avatarKey={key} tier={loreTierOf(key, avatars)} hold="unlocked" origin={owned[key]} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
