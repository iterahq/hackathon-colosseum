import type { Bounty, BountyRequirement } from '@/types/bounty';
import type { BountyOpening, LoopView } from '@/types/loop';
import type { Capabilities, CapabilityNode, LearnerProfile, ProfileCertification } from '@/types/learnerProfile';

const sameTrail = (requirement: BountyRequirement, cert: ProfileCertification): boolean => {
  const wanted = requirement.trail.replace(/…$/, '');
  return cert.trail === requirement.trail || (wanted.length > 0 && cert.trail.startsWith(wanted));
};

/** The learner-profile and the bounty board speak the same `lang`, so a trail is matched by its title in that language. */
export function certificationFor(profile: LearnerProfile | null, requirement: BountyRequirement): ProfileCertification | null {
  return profile?.certifications.find((cert) => sameTrail(requirement, cert)) ?? null;
}

export function loopView(profile: LearnerProfile | null, bounties: Bounty[]): LoopView {
  const openings = bounties
    .filter((bounty) => bounty.status === 'open')
    .map((bounty) => {
      const daysDone = certificationFor(profile, bounty.requirement)?.daysDone ?? 0;
      return { bounty, daysDone, missingDays: Math.max(0, bounty.requirement.minDays - daysDone) };
    });
  const byReward = (a: BountyOpening, b: BountyOpening) => b.bounty.rewardLamports - a.bounty.rewardLamports;
  return {
    eligible: openings.filter((o) => o.missingDays === 0).sort(byReward),
    almost: openings.filter((o) => o.missingDays > 0).sort((a, b) => a.missingDays - b.missingDays || byReward(a, b)),
  };
}

/** The capability claims a given day of a trail proves, in graph order; empty when the position is unknown. */
export function dayClaims(capabilities: Capabilities | null, trail: number | null | undefined, day: number | null | undefined): CapabilityNode[] {
  if (!capabilities || trail == null || day == null) return [];
  return capabilities.nodes.filter((node) => node.trail === trail && node.day === day);
}
