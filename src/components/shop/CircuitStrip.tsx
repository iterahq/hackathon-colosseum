import { useCircuit } from '@/hooks/useCircuit';
import { useI18n } from '@/i18n';
import { CARD, FOCUS, MONO_LABEL } from './shopStyles';

/** The Circuito in one line of the shop header: what this learner's purchases, and the whole shop, paid forward. */
export function CircuitStrip({ wallet }: { wallet: string | null }) {
  const { t } = useI18n();
  const { data } = useCircuit(wallet);
  if (!data) return null;
  const mine = data.wallet?.stampsFunded ?? 0;
  const total = t('circuit.total', { n: data.stampsFunded.toLocaleString() });

  return (
    <aside className={`${CARD} flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3`} data-testid="circuit-strip" data-mine={mine} data-total={data.stampsFunded}>
      <span className={`${MONO_LABEL} rounded-full border border-[#3FD17F] px-2 py-[3px] text-[#3FD17F]`}>{t('circuit.name')}</span>
      <p className="min-w-0 flex-1 basis-[240px] [font:500_14px/1.45_Inter] text-[#C9BFB0]">
        <span className="text-[#F4EDE2]">{mine > 0 ? t('circuit.mine', { n: mine.toLocaleString() }) : t('circuit.none')}</span>
        {' · '}
        {data.treasuryExplorerUrl ? (
          <a href={data.treasuryExplorerUrl} target="_blank" rel="noopener noreferrer" data-testid="circuit-explorer" className={`rounded text-[#3FD17F] hover:underline ${FOCUS}`}>
            {total} ↗
          </a>
        ) : (
          total
        )}
      </p>
      <p className="basis-full [font:400_12px/1.45_Inter] text-[#A0978A]">{t('circuit.how')}</p>
    </aside>
  );
}
