import { FOCUS_EARN_STORY_OFF, FOCUS_PAID_TERAS_OFF } from '@/config/focus';
import { useCircuit } from '@/hooks/useCircuit';
import { useI18n } from '@/i18n';
import { plural } from '@/utils/bounty';
import { readAtLabel } from '@/utils/landingStats';
import { LandingBountyStats } from './LandingBountyStats';
import { LandingStat } from './LandingStat';

/**
 * Live counters of the story the page tells, the team's own test runs included: the stamps written on chain and the
 * shop purchases, each with its qualifier inside its own card. The stamps tile is the count written on chain, never a
 * capacity. A failed read shows nothing, never a made-up number. A build that tells the bounty story adds its tiles.
 */
export function LandingLiveStats() {
  const paidOff = FOCUS_PAID_TERAS_OFF;
  const { t, locale } = useI18n();
  const circuit = useCircuit(null);
  const numberLocale = locale === 'pt' ? 'pt-BR' : 'en-US';
  const counter = circuit.data ?? null;
  if (!FOCUS_EARN_STORY_OFF) return <LandingBountyStats />;
  const readAt = readAtLabel([counter?.asOf], locale);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:max-w-[560px]" data-testid="landing-stats">
        {(circuit.isPending || counter) && (
          <>
            {(!counter || counter.stampsIssued !== null) && (
              <LandingStat value={counter ? (counter.stampsIssued ?? 0).toLocaleString(numberLocale) : null} label={plural(t, 'landing.live.stampsIssued', counter?.stampsIssued ?? 0)} hint={counter ? t('landing.live.stampsIssuedHintPlain') : null} testId="landing-stamps-hint" />
            )}
            {!paidOff && <LandingStat value={counter ? counter.purchases.toLocaleString(numberLocale) : null} label={plural(t, 'landing.live.purchases', counter?.purchases ?? 0)} hint={counter ? t('landing.live.purchasesHint') : null} testId="landing-purchases-hint" />}
          </>
        )}
      </div>
      {readAt && (
        <p className="[font:500_12px_JetBrains_Mono] text-[#A0978A]" data-testid="landing-live-readat">
          {t('landing.live.readAt', { time: readAt })}
        </p>
      )}
      {circuit.isError && <p className="[font:400_14px_Inter] text-[#A0978A]">{t('landing.live.unavailable')}</p>}
    </div>
  );
}
