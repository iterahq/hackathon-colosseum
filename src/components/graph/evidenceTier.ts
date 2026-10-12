import type { SkillBadgeTier } from '@/components/skills/SkillBadge';
import type { CapabilityNode } from '@/types/learnerProfile';

export type EvidenceTier = SkillBadgeTier;

export interface EvidenceShare {
  /** Answers the server graded. */
  graded: number;
  /** Answers that had something to grade, plus completions from before server grading. */
  total: number;
}

export const TIERS: readonly EvidenceTier[] = ['top', 'middle', 'base'];
export const TIER_COLOR: Record<EvidenceTier, string> = { top: '#F2C66D', middle: '#C9BFB0', base: '#C08552' };

const SHARE = /^(\d{1,3})\/(\d{1,3})(?: \+(\d{1,3}) legacy)?$/;

/** "10/12" or "2/2 +14 legacy" as numbers; `null` for anything else, or a share that claims more than its total. */
export function parseShare(text: string | null | undefined): EvidenceShare | null {
  const match = typeof text === 'string' ? SHARE.exec(text) : null;
  if (!match) return null;
  const graded = Number(match[1]);
  const total = Number(match[2]) + Number(match[3] ?? 0);
  return graded <= Number(match[2]) ? { graded, total } : null;
}

/** The share a version 2 evidence document states about itself; `null` for version 1 or an unreadable document. */
export function evidenceShare(evidence: string): EvidenceShare | null {
  try {
    const parsed = JSON.parse(evidence) as { v?: unknown; verified?: unknown };
    return parsed.v === 2 && typeof parsed.verified === 'string' ? parseShare(parsed.verified) : null;
  } catch {
    return null;
  }
}

/**
 * Who checked the answers behind a proof: the server all of them, some of them, or none. Never a grade of the learner.
 * `null` when the evidence states no share at all (a version 1 document): saying nothing is not the weakest tier.
 */
export function tierOf(share: EvidenceShare | null): EvidenceTier | null {
  if (!share) return null;
  if (share.graded <= 0 || share.total <= 0) return 'base';
  return share.graded >= share.total ? 'top' : 'middle';
}

/** The tier of a node from the share its list entry carries; `null` when the node is unproven or its evidence states no share. */
export function nodeTier(node: CapabilityNode): EvidenceTier | null {
  return node.proof ? tierOf(parseShare(node.proof.graded)) : null;
}

export function tierCounts(nodes: readonly CapabilityNode[]): Record<EvidenceTier, number> | null {
  const counts: Record<EvidenceTier, number> = { top: 0, middle: 0, base: 0 };
  let seen = 0;
  for (const node of nodes) {
    const tier = nodeTier(node);
    if (!tier) continue;
    counts[tier] += 1;
    seen += 1;
  }
  return seen > 0 ? counts : null;
}
