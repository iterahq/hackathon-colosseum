import type { Bounty, BountyRequirement } from '@/types/bounty';
import type { BountyOpening, LoopView, StampExpectation } from '@/types/loop';
import type { Capabilities, CapabilityNode, LearnerProfile, ProfileCertification } from '@/types/learnerProfile';

const sameTrail = (requirement: BountyRequirement, cert: ProfileCertification): boolean => {
  const wanted = requirement.trail.replace(/…$/, '');
  return cert.trail === requirement.trail || (wanted.length > 0 && cert.trail.startsWith(wanted));
};

/** The learner-profile and the bounty board speak the same `lang`, so a trail is matched by its title in that language. */
export function certificationFor(profile: LearnerProfile | null, requirement: BountyRequirement): ProfileCertification | null {
  return profile?.certifications.find((cert) => sameTrail(requirement, cert)) ?? null;
}

/** A judge bounty with a free copy: an automatic check approves the delivery and the escrow pays at once. */
export const paysNow = (bounty: Bounty): boolean => bounty.judge != null && bounty.judge.openCount !== 0;

export function loopView(profile: LearnerProfile | null, bounties: Bounty[]): LoopView {
  const openings = bounties
    .filter((bounty) => bounty.status === 'open')
    .map((bounty) => {
      const daysDone = certificationFor(profile, bounty.requirement)?.daysDone ?? 0;
      return { bounty, daysDone, missingDays: Math.max(0, bounty.requirement.minDays - daysDone) };
    });
  const byReward = (a: BountyOpening, b: BountyOpening) => b.bounty.rewardLamports - a.bounty.rewardLamports;
  const instantFirst = (a: BountyOpening, b: BountyOpening) => Number(paysNow(b.bounty)) - Number(paysNow(a.bounty)) || byReward(a, b);
  const eligible = openings.filter((o) => o.missingDays === 0).sort(instantFirst);
  return {
    eligible,
    instant: eligible.find((o) => paysNow(o.bounty)) ?? null,
    almost: openings.filter((o) => o.missingDays > 0).sort((a, b) => a.missingDays - b.missingDays || byReward(a, b)),
  };
}

/** The capability claims a given day of a trail proves, in graph order; empty when the position is unknown. */
export function dayClaims(capabilities: Capabilities | null, trail: number | null | undefined, day: number | null | undefined): CapabilityNode[] {
  if (!capabilities || trail == null || day == null) return [];
  return capabilities.nodes.filter((node) => node.trail === trail && node.day === day);
}

/**
 * True when a profile read already carries the stamp: the certification is verified on chain with at least
 * the stamped days, and no claim of that day is still waiting for the chain.
 */
export function stampShown(profile: LearnerProfile | null, stamp: StampExpectation): boolean {
  const cert = profile?.certifications.find((c) => c.asset === stamp.asset);
  if (!cert || !cert.verified || cert.daysDone < stamp.daysDone) return false;
  return dayClaims(profile?.capabilities ?? null, stamp.trail, stamp.day).every((node) => node.status !== 'recorded');
}
