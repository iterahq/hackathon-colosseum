import { AppWindow, Server } from 'lucide-react';
import { useClaimJourney } from '@/hooks/useLearnerProfile';
import { useI18n } from '@/i18n';
import type { JourneyActivity } from '@/types/learnerProfile';

const LABEL = '[font:700_11px_JetBrains_Mono] uppercase tracking-[.08em] text-[#A0978A]';

function Row({ activity, index }: { activity: JourneyActivity; index: number }) {
  const { t } = useI18n();
  const hidden = activity.tries - activity.verdicts.length;
  const mode = t(`graph.track.mode.${activity.mode}`);
  const Mode = activity.mode === 'server' ? Server : AppWindow;
  return (
    <li className="flex h-4 items-center gap-2" aria-label={t('graph.track.row', { n: index + 1, tries: activity.tries, mode })} data-testid="graph-track-row" data-mode={activity.mode} data-tries={activity.tries}>
      <span className="w-5 shrink-0 text-right [font:500_10px/1_JetBrains_Mono] text-[#6F675C]" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <span className="flex min-w-0 flex-1 items-center gap-1" aria-hidden="true">
        {hidden > 0 && <span className="shrink-0 [font:700_10px/1_JetBrains_Mono] text-[#F2C66D]">+{hidden}</span>}
        {activity.verdicts.map((hit, at) => (
          <span key={at} className={`graph-track-dot h-2.5 w-2.5 shrink-0 rounded-full ${hit ? 'bg-[#3FD17F] shadow-[0_0_6px_rgba(63,209,127,.6)]' : 'bg-[#F2C66D]/85'}`} style={{ animationDelay: `${Math.min(at, 12) * 40}ms` }} data-hit={hit} />
        ))}
      </span>
      <Mode aria-hidden className={`h-3.5 w-3.5 shrink-0 ${activity.mode === 'server' ? 'text-[#3FD17F]' : 'text-[#6F675C]'}`} strokeWidth={2.2}>
        <title>{mode}</title>
      </Mode>
    </li>
  );
}

/** How the lesson behind a claim was passed: one row of dots per graded activity. Read from Itera's table, and says so. */
export function AttemptTrack({ wallet, claimId }: { wallet: string; claimId: string }) {
  const { t } = useI18n();
  const query = useClaimJourney(wallet, claimId);
  const journey = query.data;
  const empty = journey && journey.activities.length === 0;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-[#262320] bg-[#0A0908] p-3.5" aria-label={t('graph.track.title')} data-testid="graph-track">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className={LABEL}>{t('graph.track.title')}</h3>
        <span className="[font:500_10px/1.2_JetBrains_Mono] text-[#6F675C]" data-testid="graph-track-source">{t('graph.track.source')}</span>
      </div>
      {query.isPending && <div className="h-16 animate-pulse rounded-lg bg-[#141210]" data-testid="graph-track-loading" />}
      {query.isError && (
        <p role="alert" className="flex items-center justify-between gap-3 [font:500_12px_JetBrains_Mono] text-[#F2C66D]" data-testid="graph-track-failed">
          {t('graph.track.failed')}
          <button type="button" onClick={() => void query.refetch()} className="inline-flex min-h-11 items-center rounded-lg border border-[#3a352f] px-3 text-[#F4EDE2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]">
            {t('graph.retry')}
          </button>
        </p>
      )}
      {empty && (
        <p className="flex items-center gap-2 [font:500_12px_JetBrains_Mono] text-[#6F675C]" data-testid="graph-track-empty">
          <span className="flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((at) => <span key={at} className="h-2.5 w-2.5 rounded-full border border-dashed border-[#3a352f]" />)}
          </span>
          {t('graph.track.empty')}
        </p>
      )}
      {journey && !empty && (
        <>
          <dl className="grid grid-cols-2 gap-2">
            <div className="flex items-baseline gap-2 rounded-lg bg-[#141210] px-3 py-2">
              <dd className="[font:700_30px/1_'Barlow_Condensed'] text-[#F4EDE2]" data-testid="graph-track-tries">{journey.tries}</dd>
              <dt className={LABEL}>{t('graph.track.tries')}</dt>
            </div>
            <div className="flex items-baseline gap-2 rounded-lg bg-[#141210] px-3 py-2">
              <dd className="[font:700_30px/1_'Barlow_Condensed'] text-[#3FD17F]" data-testid="graph-track-first">{journey.firstTry}<span className="text-[18px] text-[#6F675C]">/{journey.activities.length}</span></dd>
              <dt className={LABEL}>{t('graph.track.firstTry')}</dt>
            </div>
          </dl>
          <ol className="flex flex-col gap-1.5">
            {journey.activities.map((activity, index) => <Row key={index} activity={activity} index={index} />)}
          </ol>
        </>
      )}
    </section>
  );
}
