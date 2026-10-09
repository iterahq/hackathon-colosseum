import { useMemo } from 'react';
import type { PassportPageData } from '@/types/achievements';
import { useI18n } from '@/i18n';
import type { Trail } from '@/types/trailDashboard';
import { countOf } from '@/utils/plural';
import { TrailCard } from './TrailCard';

interface Props {
  trails: Trail[];
  pages: PassportPageData[];
  finished: number;
  onOpen: (trail: Trail) => void;
}

/** "Suas trilhas": every trail of the learner as a card, always visible; locked ones are muted, never hidden. */
export function TrailCards({ trails, pages, finished, onOpen }: Props) {
  const { t } = useI18n();
  const certs = useMemo(() => new Map(pages.map((p) => [p.trailId, p])), [pages]);
  const done = `${finished} ${t(finished === 1 ? 'dash.trails.done.one' : 'dash.trails.done.other')}`;
  return (
    <section className="flex min-w-0 flex-col gap-4" data-testid="trail-cards">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 [font:700_32px_'Barlow_Condensed']">{t('dash.trails.title')}</h2>
        <span className="[font:500_13px_JetBrains_Mono] text-[#A0978A]">{t('dash.trails.summary', { total: countOf(t, trails.length, 'trail'), done })}</span>
      </div>
      <div className="flex flex-1 flex-col gap-5">
        {trails.map((trail) => (
          <TrailCard key={trail.id} trail={trail} cert={certs.get(trail.id)} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}
