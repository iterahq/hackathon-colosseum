import { useState } from 'react';
import { useI18n } from '@/i18n';
import type { Capabilities } from '@/types/learnerProfile';
import type { ChainState, Progress } from '@/components/graph/capabilityView';
import { nodeTier } from '@/components/graph/evidenceTier';
import { TierChips } from '@/components/graph/TierMedal';

interface Props {
  capabilities: Capabilities;
  chain: ChainState;
  proven: number;
  progress: Record<number, Progress>;
  hasRecorded: boolean;
  onRetry: () => void;
}

const RING = 2 * Math.PI * 38;

function Dot({ className }: { className: string }) {
  return <span className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full ${className}`} aria-hidden="true" />;
}

export function GraphHeader({ capabilities, chain, proven, progress, hasRecorded, onRetry }: Props) {
  const { t } = useI18n();
  const total = capabilities.total;
  const ratio = Math.min(1, proven / Math.max(1, total));
  const [legend, setLegend] = useState(false);
  const hasMedals = capabilities.nodes.some((n) => nodeTier(n) !== null);

  return (
    <div className="flex flex-col gap-4 rounded-[14px] border border-[#262320] bg-[#141210] p-4 sm:px-6 sm:py-5 lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:gap-x-10 lg:gap-y-3" data-testid="graph-header">
      <div className="flex items-center justify-between gap-4 lg:justify-start lg:gap-5">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <h2 id="graph-heading" className="[font:700_12px_JetBrains_Mono] uppercase tracking-[.18em] text-[#A0978A]">{t('graph.title')}</h2>
            {hasMedals && (
              <button type="button" onClick={() => setLegend((open) => !open)} aria-expanded={legend} aria-controls="graph-tier-legend" aria-label={t('graph.tier.help')} title={t('graph.tier.help')} className="-my-3 grid h-11 w-11 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]" data-testid="graph-tier-help">
                <span className={`grid h-5 w-5 place-items-center rounded-full border [font:700_11px/1_JetBrains_Mono] ${legend ? 'border-[#3FD17F] text-[#3FD17F]' : 'border-[#3a352f] text-[#A0978A]'}`} aria-hidden="true">?</span>
              </button>
            )}
          </div>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="[font:700_60px/1_'Barlow_Condensed'] text-[#3FD17F] max-sm:text-[52px]" data-testid="graph-counter">{t('graph.counter', { n: proven, total })}</span>
            <span className="max-w-[11rem] [font:600_14px/1.3_Inter] text-[#F4EDE2] lg:max-w-none lg:whitespace-nowrap">{t('graph.counterLabel')}</span>
          </p>
          {chain.phase !== 'done' && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 [font:500_13px/1.4_JetBrains_Mono] text-[#A0978A]" data-testid="graph-chain-state">
              {chain.phase === 'pending' && t('graph.checking')}
              {chain.phase === 'error' && (
                <>
                  <span>{t('graph.serverRead')}</span>
                  <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center rounded-lg border border-[#3FD17F] px-3 text-[#3FD17F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F4EDE2]" data-testid="graph-retry">
                    {t('graph.retry')}
                  </button>
                </>
              )}
            </p>
          )}
        </div>
        <svg width="76" height="76" viewBox="0 0 92 92" className="shrink-0 max-sm:h-[68px] max-sm:w-[68px]" role="img" aria-label={`${proven}/${total}`}>
          <circle cx="46" cy="46" r="38" fill="none" stroke="#262320" strokeWidth="7" />
          <circle cx="46" cy="46" r="38" fill="none" stroke="#3FD17F" strokeWidth="7" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING * (1 - ratio)} transform="rotate(-90 46 46)" style={{ filter: 'drop-shadow(0 0 6px rgba(63,209,127,.55))' }} />
          <text x="46" y="53" textAnchor="middle" fill="#F4EDE2" style={{ font: "700 22px 'Barlow Condensed'" }}>{Math.round(ratio * 100)}%</text>
        </svg>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3" data-testid="graph-trail-progress">
        {capabilities.trails.map((tr) => {
          const p = progress[tr.trail] ?? { proven: 0, total: 0 };
          return (
            <li key={tr.trail} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate [font:600_13px_Inter] text-[#F4EDE2]">{tr.title}</span>
                <span className="[font:500_12px_JetBrains_Mono] text-[#A0978A]">{t('graph.trailCount', { n: p.proven, total: p.total })}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#262320]">
                <div className="h-full rounded-full bg-gradient-to-r from-[#3FD17F] to-[#8DFFBC]" style={{ width: `${(p.proven / Math.max(1, p.total)) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 [font:500_13px_Inter] text-[#C9BFB0] lg:col-span-2 lg:row-start-2" aria-label="legend" data-testid="graph-legend">
        <li className="flex items-center gap-2"><Dot className="bg-[#3FD17F] shadow-[0_0_10px_rgba(63,209,127,.7)]" />{t('graph.legend.proven')}</li>
        <li className="flex items-center gap-2"><Dot className="border-2 border-[#3FD17F] bg-transparent" />{t('graph.legend.next')}</li>
        <li className="flex items-center gap-2"><Dot className="border-2 border-[#3a352f] bg-transparent" />{t('graph.legend.open')}</li>
        {hasRecorded && <li className="flex items-center gap-2"><Dot className="border-2 border-[#F2C66D] bg-transparent" />{t('graph.legend.recorded')}</li>}
      </ul>
      {hasMedals && (
        <div id="graph-tier-legend" hidden={!legend} className="lg:col-span-2 lg:row-start-3">
          <TierChips testId="graph-tier-legend" />
        </div>
      )}
    </div>
  );
}
