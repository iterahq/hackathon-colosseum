import { useBountyBoard } from '@/hooks/useBounties';
import { useCircuit } from '@/hooks/useCircuit';
import { useI18n } from '@/i18n';
import { LandingStat } from './LandingStat';

/** Live counters from the public bounty board and the Circuit. A failed read shows nothing, never a made-up number. */
export function LandingLiveStats() {
  const { t, locale } = useI18n();
  const board = useBountyBoard();
  const circuit = useCircuit(null);
  const numberLocale = locale === 'pt' ? 'pt-BR' : 'en-US';
  const stats = board.data?.stats ?? null;
  const counter = circuit.data ?? null;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="landing-stats">
        {(board.isPending || stats) && (
          <>
            <LandingStat value={stats ? stats.openCount : null} label={t('landing.live.bountiesOpen')} />
            <LandingStat value={stats ? stats.lockedSol : null} label={t('landing.live.lockedSol')} />
            <div className="flex flex-col gap-1">
              <LandingStat value={stats ? stats.paidCount : null} label={t('landing.live.paidCount')} />
              {stats && stats.paidCount > 0 && stats.outsidePaidCount === 0 && <span className="[font:500_12px_JetBrains_Mono] text-[#A0978A]" data-testid="landing-paid-rehearsal">{t('bounty.card.rehearsal')}</span>}
            </div>
          </>
        )}
        {(circuit.isPending || counter) && (
          <>
            <LandingStat value={counter ? counter.stampsFunded.toLocaleString(numberLocale) : null} label={t('landing.live.stampsFunded')} />
            <LandingStat value={counter ? counter.purchases.toLocaleString(numberLocale) : null} label={t('landing.live.purchases')} />
          </>
        )}
      </div>
      {board.isError && circuit.isError && <p className="[font:400_14px_Inter] text-[#A0978A]">{t('landing.live.unavailable')}</p>}
    </div>
  );
}
