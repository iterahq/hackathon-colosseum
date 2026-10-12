import { motion, useReducedMotion } from 'framer-motion';
import { Medal } from 'lucide-react';
import { skillIcon, type SkillBadgeState } from './skillIcon';

export type { SkillBadgeState } from './skillIcon';
export type SkillBadgeTier = 'top' | 'middle' | 'base';
export type SkillBadgeSize = 'sm' | 'md';

export interface SkillBadgeProps {
  /** The claim id of the capability graph: picks the icon. */
  claimId: string;
  /** The visible label, already in the reader's language. Keep it short. */
  title: string;
  /** The full sentence of the claim, for the tooltip and for a screen reader. */
  hint?: string;
  state?: SkillBadgeState;
  /** The state in words, for a screen reader ("locked", "proven"). */
  stateLabel?: string;
  /** The medal on the corner. Null or absent: no medal. */
  tier?: SkillBadgeTier | null;
  /** The tier in words, for the tooltip and for a screen reader. */
  tierLabel?: string;
  /** `sm`: a pill with the label beside the icon. `md`: a tile with the label under it. */
  size?: SkillBadgeSize;
  /** Pops in when it mounts. Ignored under `prefers-reduced-motion`. */
  animate?: boolean;
  /** Position in a row, to stagger the pop. */
  index?: number;
  className?: string;
  testId?: string;
}

const TIER_COLOR: Record<SkillBadgeTier, string> = { top: '#F2C66D', middle: '#C9BFB0', base: '#C08552' };

const SHELL: Record<SkillBadgeState, string> = {
  lit: 'border-[#3FD17F]/60 bg-[#3FD17F]/10 text-[#F4EDE2]',
  locked: 'border-dashed border-[#3A352F] bg-[#0A0908] text-[#A0978A]',
  neutral: 'border-[#2E2A25] bg-[#1C1916] text-[#C9BFB0]',
};

const DISC: Record<SkillBadgeState, string> = {
  lit: 'border-[#3FD17F] bg-[radial-gradient(circle_at_50%_28%,#266E45,#0F2A1B_72%)] text-[#8DFFBC] shadow-[0_0_14px_rgba(63,209,127,.45)]',
  locked: 'border-[#3A352F] bg-[#141210] text-[#7A7268]',
  neutral: 'border-[#5E574E] bg-[#141210] text-[#C9BFB0]',
};

const TILE_LABEL: Record<SkillBadgeState, string> = { lit: 'text-[#F4EDE2]', locked: 'text-[#A0978A]', neutral: 'text-[#C9BFB0]' };

function TierMark({ tier, label, small }: { tier: SkillBadgeTier; label?: string; small: boolean }) {
  return (
    <span
      className={`absolute grid place-items-center rounded-full border border-[#0A0908] bg-[#141210] ${small ? '-bottom-1 -right-1 h-3.5 w-3.5' : '-bottom-1 -right-1 h-5 w-5'}`}
      style={{ color: TIER_COLOR[tier] }}
      title={label}
      data-testid="skill-badge-tier"
      data-tier={tier}
    >
      <Medal aria-hidden className={small ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} strokeWidth={2.4} />
    </span>
  );
}

/** One skill of the capability graph as a badge: lit when proven, a padlock when not, neutral when nobody is being judged. */
export function SkillBadge({ claimId, title, hint, state = 'neutral', stateLabel, tier = null, tierLabel, size = 'sm', animate = false, index = 0, className = '', testId = 'skill-badge' }: SkillBadgeProps) {
  const reduced = useReducedMotion();
  const Icon = skillIcon(claimId, state);
  const small = size === 'sm';
  const spoken = [stateLabel, tier ? tierLabel : null].filter(Boolean).join(', ');
  const motionProps =
    animate && !reduced
      ? { initial: { opacity: 0, scale: 0.7 }, animate: { opacity: 1, scale: 1 }, transition: { type: 'spring' as const, stiffness: 420, damping: 22, delay: index * 0.06 } }
      : {};

  const disc = (
    <span className={`relative grid shrink-0 place-items-center rounded-full border-2 ${DISC[state]} ${small ? 'h-6 w-6' : 'h-12 w-12'}`}>
      <Icon aria-hidden className={small ? 'h-3 w-3' : 'h-5 w-5'} strokeWidth={2.4} />
      {tier && <TierMark tier={tier} label={tierLabel} small={small} />}
    </span>
  );
  const sr = spoken ? <span className="sr-only"> ({spoken})</span> : null;

  if (small) {
    return (
      <motion.span
        {...motionProps}
        title={hint ?? title}
        className={`inline-flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 ${SHELL[state]} ${className}`}
        data-testid={testId}
        data-state={state}
        data-tier={tier ?? undefined}
        data-claim={claimId}
      >
        {disc}
        <span className="truncate [font:600_11px/1_JetBrains_Mono] tracking-[.02em]">{title}</span>
        {sr}
      </motion.span>
    );
  }
  return (
    <motion.span
      {...motionProps}
      title={hint ?? title}
      className={`inline-flex w-[76px] min-w-0 flex-col items-center gap-1.5 text-center ${className}`}
      data-testid={testId}
      data-state={state}
      data-tier={tier ?? undefined}
      data-claim={claimId}
    >
      {disc}
      <span className={`line-clamp-2 w-full [font:600_10.5px/1.2_JetBrains_Mono] tracking-[.02em] [overflow-wrap:anywhere] ${TILE_LABEL[state]}`}>{title}</span>
      {sr}
    </motion.span>
  );
}
