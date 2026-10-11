import { createElement } from 'react';
import { Link } from 'react-router-dom';
import { Check, CircleDashed, Clock } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Capabilities, CapabilityStatus } from '@/types/learnerProfile';
import { dayClaims } from '@/utils/loopView';
import { LOOP_LABEL, LOOP_LINK } from './loopStyles';

const ICON: Record<CapabilityStatus, typeof Check> = { verified: Check, recorded: Clock, open: CircleDashed };
const TONE: Record<CapabilityStatus, string> = { verified: 'text-[#3FD17F]', recorded: 'text-[#F2C94C]', open: 'text-[#5E574E]' };

/** The capability claims this day proves (or the whole count when the day is unknown), each with its chain status. */
export function ProvedToday({ capabilities, trail, day, wallet }: { capabilities: Capabilities; trail?: number | null; day?: number | null; wallet: string }) {
  const { t } = useI18n();
  const claims = dayClaims(capabilities, trail, day);
  return (
    <section className="flex flex-col gap-3" data-testid="loop-proved">
      <span className={LOOP_LABEL}>{t('loop.proved.title')}</span>
      <span className="[font:700_22px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">{t('loop.proved.summary', { n: capabilities.verifiedCount, total: capabilities.total })}</span>
      {claims.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {claims.map((node) => (
              <li key={node.id} className="flex items-start gap-2 [font:500_14px/1.4_Inter] text-[#C9BFB0]" data-testid="loop-claim" data-status={node.status}>
                {createElement(ICON[node.status], { size: 16, className: `mt-[3px] shrink-0 ${TONE[node.status]}`, 'aria-hidden': true })}
                <span>
                  <span className="text-[#F4EDE2]">{node.title}</span>
                  <span className="block [font:500_11px_JetBrains_Mono] text-[#A0978A]">{t(`loop.proved.${node.status}`)}</span>
                </span>
              </li>
          ))}
        </ul>
      )}
      <Link to={`/u/${wallet}`} className={LOOP_LINK} data-testid="loop-profile-link">
        {t('loop.proved.profile')} →
      </Link>
    </section>
  );
}
