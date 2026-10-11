import { Link } from 'react-router-dom';
import { useBountyBoard } from '@/hooks/useBounties';
import { useCircuit } from '@/hooks/useCircuit';
import { useI18n } from '@/i18n';
import { plural } from '@/utils/bounty';
import { paidHint, readAtLabel } from '@/utils/landingStats';
import { localizeDecimal } from '@/utils/shopPrice';
import { LandingStat } from './LandingStat';

/**
 * Live counters from the public bounty board and the Circuit, the team's own test runs included; each number
 * carries its qualifier inside its own card. The stamps tile is the count written on chain, never a capacity.
 * A failed read shows nothing, never a made-up number.
 */
export function LandingLiveStats() {
  const { t, locale } = useI18n();
  const board = useBountyBoard();
  const circuit = useCircuit(null);
  const numberLocale = locale === 'pt' ? 'pt-BR' : 'en-US';
  const stats = board.data?.stats ?? null;
  const counter = circuit.data ?? null;
  const readAt = readAtLabel([board.data?.readAt, counter?.asOf], locale);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="landing-stats">
        {(board.isPending || stats) && (
          <>
            <LandingStat value={stats ? stats.openCount : null} label={t('landing.live.bountiesOpen')} />
            <LandingStat value={stats ? localizeDecimal(stats.lockedSol, locale) : null} label={t('landing.live.lockedSol')} />
            <LandingStat value={stats ? stats.paidCount : null} label={plural(t, 'landing.live.paidCount', stats?.paidCount ?? 0)} hint={stats ? paidHint(stats, t) : null} testId="landing-paid-hint" />
          </>
        )}
        {(circuit.isPending || counter) && (
          <>
            {(!counter || counter.stampsIssued !== null) && (
              <LandingStat value={counter ? (counter.stampsIssued ?? 0).toLocaleString(numberLocale) : null} label={plural(t, 'landing.live.stampsIssued', counter?.stampsIssued ?? 0)} hint={counter ? t('landing.live.stampsIssuedHint') : null} testId="landing-stamps-hint" />
            )}
            <LandingStat value={counter ? counter.purchases.toLocaleString(numberLocale) : null} label={plural(t, 'landing.live.purchases', counter?.purchases ?? 0)} hint={counter ? t('landing.live.purchasesHint') : null} testId="landing-purchases-hint" />
          </>
        )}
      </div>
      {readAt && (
        <p className="[font:500_12px_JetBrains_Mono] text-[#A0978A]" data-testid="landing-live-readat">
          {t('landing.live.readAt', { time: readAt })}
        </p>
      )}
      <p className="[font:500_13px/1.5_Inter] text-[#A0978A]" data-testid="landing-talent-line">
        <Link to="/talent" className="inline-flex min-h-11 items-center rounded text-[#C9BFB0] underline underline-offset-4 hover:text-[#3FD17F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]">
          {t('talent.landing.line')} →
        </Link>
      </p>
      {board.isError && circuit.isError && <p className="[font:400_14px_Inter] text-[#A0978A]">{t('landing.live.unavailable')}</p>}
    </div>
  );
}
