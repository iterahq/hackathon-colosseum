import { motion, useReducedMotion } from 'framer-motion';
import { Medal } from 'lucide-react';
import { useI18n } from '@/i18n';
import { TIERS, TIER_COLOR, type EvidenceShare, type EvidenceTier } from '@/components/graph/evidenceTier';

const SEGMENT_LIMIT = 24;

/** The medal of an evidence tier. `sm` sits on the corner of a graph node, `lg` heads the detail sheet. */
export function TierMedal({ tier, size = 'sm', label, animate = false, className = '' }: { tier: EvidenceTier; size?: 'sm' | 'md' | 'lg'; label?: string; animate?: boolean; className?: string }) {
  const reduced = useReducedMotion();
  const color = TIER_COLOR[tier];
  const box = size === 'lg' ? 'h-16 w-16 border-2' : size === 'md' ? 'h-7 w-7 border' : 'h-[22px] w-[22px] border';
  const icon = size === 'lg' ? 'h-8 w-8' : size === 'md' ? 'h-4 w-4' : 'h-3 w-3';
  const pop = animate && !reduced ? { initial: { scale: 0.5, rotate: -18, opacity: 0 }, animate: { scale: 1, rotate: 0, opacity: 1 }, transition: { type: 'spring' as const, stiffness: 380, damping: 18 } } : {};
  return (
    <motion.span
      {...pop}
      className={`grid shrink-0 place-items-center rounded-full bg-[#141210] ${box} ${className}`}
      style={{ color, borderColor: color, boxShadow: size === 'lg' ? `0 0 26px ${color}55, inset 0 0 14px ${color}33` : `0 0 8px ${color}55` }}
      title={label}
      data-testid="tier-medal"
      data-tier={tier}
    >
      <Medal aria-hidden className={icon} strokeWidth={2.2} />
      {label && <span className="sr-only">{label}</span>}
    </motion.span>
  );
}

/** `10/12` as twelve segments, ten lit. A long share falls back to one continuous bar. */
export function TierBar({ share, tier }: { share: EvidenceShare; tier: EvidenceTier }) {
  const { t } = useI18n();
  const color = TIER_COLOR[tier];
  const label = t('graph.tier.share', { graded: share.graded, total: share.total });
  const segmented = share.total > 0 && share.total <= SEGMENT_LIMIT;
  return (
    <span className="flex items-center gap-2.5" role="img" aria-label={label} title={label}>
      {segmented ? (
        <span className="flex h-2.5 min-w-0 flex-1 gap-[3px]">
          {Array.from({ length: share.total }, (_, index) => (
            <span key={index} className="h-full min-w-0 flex-1 rounded-[2px]" style={index < share.graded ? { background: color, boxShadow: `0 0 6px ${color}66` } : { background: '#262320' }} data-on={index < share.graded} />
          ))}
        </span>
      ) : (
        <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#262320]">
          <span className="block h-full rounded-full" style={{ width: `${(share.graded / Math.max(1, share.total)) * 100}%`, background: color }} />
        </span>
      )}
      <span className="shrink-0 [font:700_15px/1_JetBrains_Mono] text-[#F4EDE2]">
        {share.graded}/{share.total}
      </span>
    </span>
  );
}

/** The three tiers, one chip each, with an optional count in front of the name. */
export function TierChips({ counts, compact = false, testId, className = '' }: { counts?: Record<EvidenceTier, number> | null; compact?: boolean; testId: string; className?: string }) {
  const { t } = useI18n();
  return (
    <ul className={`flex flex-wrap gap-x-2 gap-y-1.5 ${className}`} aria-label={t('graph.tier.legend')} data-testid={testId}>
      {TIERS.map((tier) => (
        <li key={tier} className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#262320] bg-[#0A0908] py-0.5 pl-0.5 pr-2.5 ${counts && counts[tier] === 0 ? 'opacity-55' : ''}`} title={t(`graph.tier.${tier}`)} data-tier={tier} data-count={counts ? counts[tier] : undefined}>
          <TierMedal tier={tier} />
          {counts && <span className="[font:700_13px/1_JetBrains_Mono]" style={{ color: TIER_COLOR[tier] }}>{counts[tier]}</span>}
          <span className={compact ? 'sr-only' : '[font:500_11px/1_JetBrains_Mono] text-[#C9BFB0]'}>{t(`graph.tier.${tier}`)}</span>
        </li>
      ))}
    </ul>
  );
}
