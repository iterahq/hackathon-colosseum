import { useI18n } from '@/i18n';
import type { Trail } from '@/types/trailDashboard';
import { countOf } from '@/utils/plural';
import { TrailCard } from './TrailCard';
import { TrailLockedRow } from './TrailLockedRow';

interface Props {
  trails: Trail[];
  total: number;
  finished: number;
  onOpen: (trail: Trail) => void;
}

/** The trails you can start first (a snap row on phones), the locked ones folded into rows under a disclosure. */
export function TrailCards({ trails, total, finished, onOpen }: Props) {
  const { t } = useI18n();
  const open = trails.filter((trail) => trail.status !== 'locked');
  const locked = trails.filter((trail) => trail.status === 'locked');
  const done = `${finished} ${t(finished === 1 ? 'dash.trails.done.one' : 'dash.trails.done.other')}`;
  return (
    <section className="flex flex-col gap-4" data-testid="trail-cards">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="[font:700_32px_'Barlow_Condensed']">{t('dash.trails.title')}</h2>
        <span className="[font:500_13px_JetBrains_Mono] text-[#A0978A]">{t('dash.trails.summary', { total: countOf(t, total, 'trail'), done })}</span>
      </div>
      {open.length > 0 && (
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4" data-testid="trail-cards-open">
          {open.map((trail) => (
            <TrailCard key={trail.id} trail={trail} onOpen={onOpen} className="w-[280px] shrink-0 snap-start sm:w-auto" />
          ))}
        </div>
      )}
      {locked.length > 0 && (
        <details className="group" data-testid="trail-cards-locked">
          <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-2 [font:500_13px_JetBrains_Mono] text-[#C9BFB0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F] [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="transition-transform group-open:rotate-90">▸</span>
            {t('dash.trails.lockedGroup', { n: locked.length })}
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {locked.map((trail) => (
              <TrailLockedRow key={trail.id} trail={trail} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
