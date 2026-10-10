import { ExternalLink, Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRecordPodium } from '@/hooks/useClassPodium';

const BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-evergreen px-5 text-sm font-medium text-obsidiana transition-colors hover:bg-evergreen-hi disabled:cursor-not-allowed disabled:opacity-60';

/** Instructor action on the class report: record the top three as soulbound medals on Solana, and what came of it. */
export function ReportPodiumChain({ sessionId, ended }: { sessionId: string; ended: boolean }) {
  const { t } = useI18n();
  const record = useRecordPodium(sessionId);
  const places = record.data?.places ?? [];

  return (
    <section className="mb-8 rounded-2xl border border-border bg-card px-4 py-4" data-testid="report-podium-chain">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-[260px]">
          <h2 className="font-display text-foreground">{t('live.report.chain.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t(ended ? 'live.report.chain.body' : 'live.report.chain.notEnded')}</p>
        </div>
        <button type="button" disabled={!ended || record.isPending} onClick={() => record.mutate()} className={BUTTON} data-testid="report-podium-record">
          {record.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {t(record.isPending ? 'live.report.chain.recording' : record.data ? 'live.report.chain.again' : 'live.report.chain.record')}
        </button>
      </div>
      {record.isError && (
        <p className="mt-3 text-sm text-destructive" role="alert" data-testid="report-podium-error">
          {t('live.report.chain.error')}
        </p>
      )}
      {record.data && places.length === 0 && <p className="mt-3 text-sm text-muted-foreground">{t('live.report.chain.empty')}</p>}
      {places.length > 0 && (
        <ol className="mt-4 divide-y divide-border rounded-xl border border-border" data-testid="report-podium-result">
          {places.map((place) => (
            <li key={place.position} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5" data-status={place.mintStatus}>
              <span className="w-6 shrink-0 font-mono text-sm text-muted-foreground">{place.position}º</span>
              <span className="min-w-0 flex-1 basis-[140px] truncate text-sm text-foreground">{place.name ?? t('live.report.chain.learner')}</span>
              <span className="text-xs text-muted-foreground">{place.title}</span>
              {place.mintStatus === 'minted' && place.explorerUrl ? (
                <a href={place.explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-6 items-center gap-1 text-xs font-medium text-menta hover:underline">
                  {t('live.report.chain.minted')}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">{t(place.wallet || place.mintStatus !== 'unclaimed' ? 'live.report.chain.pending' : 'live.report.chain.noWallet')}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
