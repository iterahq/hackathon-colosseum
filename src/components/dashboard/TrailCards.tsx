import { useI18n } from '@/i18n';
import type { Trail } from '@/types/trailDashboard';
import { TrailCard } from './TrailCard';

interface Props {
  trails: Trail[];
  total: number;
  finished: number;
  onOpen: (trail: Trail) => void;
}

export function TrailCards({ trails, total, finished, onOpen }: Props) {
  const { t } = useI18n();
  return (
    <section className="flex flex-col gap-4" data-testid="trail-cards">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="[font:700_32px_'Barlow_Condensed']">{t('dash.trails.title')}</h2>
        <span className="[font:500_13px_JetBrains_Mono] text-[#A0978A]">{t('dash.trails.summary', { total, done: finished })}</span>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {trails.map((trail) => (
          <TrailCard key={trail.id} trail={trail} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}
