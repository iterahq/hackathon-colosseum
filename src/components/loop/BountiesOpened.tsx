import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';
import type { LoopView } from '@/types/loop';
import { BountyOpeningRow } from './BountyOpeningRow';
import { LOOP_LABEL, LOOP_LINK, LOOP_LIST_MAX } from './loopStyles';

/** Open bounties the wallet can take now, then the nearest ones it cannot yet; honest when there is none. */
export function BountiesOpened({ view }: { view: LoopView }) {
  const { t } = useI18n();
  const eligible = view.eligible.slice(0, LOOP_LIST_MAX);
  const almost = view.almost.slice(0, LOOP_LIST_MAX);
  return (
    <section className="flex flex-col gap-3" data-testid="loop-opened" data-eligible={view.eligible.length}>
      <span className={LOOP_LABEL}>{t('loop.opened.title')}</span>
      {eligible.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="[font:700_13px_Inter] text-[#3FD17F]">{t('loop.opened.eligible')}</span>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {eligible.map((o) => (
              <BountyOpeningRow key={o.bounty.id} opening={o} />
            ))}
          </ul>
        </div>
      )}
      {almost.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="[font:700_13px_Inter] text-[#C9BFB0]">{t('loop.opened.almost')}</span>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {almost.map((o) => (
              <li key={o.bounty.id} className="[font:500_14px/1.45_Inter] text-[#C9BFB0]" data-testid="loop-almost" data-slug={o.bounty.slug}>
                <Link to={`/bounties/${o.bounty.slug}`} className="hover:underline">
                  {t(o.missingDays === 1 ? 'loop.opened.missing.one' : 'loop.opened.missing.many', { n: o.missingDays, trail: o.bounty.requirement.trail, title: o.bounty.title, reward: o.bounty.rewardSol })}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {eligible.length === 0 && almost.length === 0 && <p className="[font:500_14px/1.45_Inter] text-[#A0978A]" data-testid="loop-none">{t('loop.opened.none')}</p>}
      <Link to="/bounties" className={LOOP_LINK} data-testid="loop-board-link">
        {t('loop.opened.board')} →
      </Link>
    </section>
  );
}
