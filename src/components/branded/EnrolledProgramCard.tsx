/**
 * An enrolled program on the dashboard, rendered with the shared v3
 * {@link CatalogProgramCard} so Home and /catalog show the same card. The
 * `action` slot carries what only an enrolled learner has: the progress line
 * and a Start / Continue CTA.
 */
import { ArrowRight } from 'lucide-react';
import { CatalogProgramCard } from './CatalogProgramCard';
import { useI18n } from '@/i18n';
import type { CatalogProgramCardData } from '@/types/catalogProgramCardData';

export function EnrolledProgramCard({
  program,
  onOpen,
}: {
  program: CatalogProgramCardData & { completedCount?: number };
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const total = program.activityCount ?? 0;
  const done = program.completedCount ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const started = pct > 0;

  const action = (
    <div data-testid="program-card" className="space-y-3">
      {started && (
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-evergreen" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-medium text-evergreen-hi">
            {t('program.percentComplete', { n: String(pct) })}
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={onOpen}
        data-testid="program-open"
        className={
          started
            ? 'w-full inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full border border-evergreen/40 bg-evergreen-soft text-evergreen-hi font-medium hover:bg-evergreen-soft/70 transition-colors'
            : 'w-full inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors'
        }
      >
        {started ? t('program.continue') : t('program.start')} <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );

  return <CatalogProgramCard program={program} onOpenThumbnail={onOpen} action={action} />;
}
