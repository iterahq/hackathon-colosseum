import { parseShare, tierOf, type EvidenceTier } from '@/components/graph/evidenceTier';
import { skillFamily, type SkillFamily } from '@/components/skills/skillIcon';
import type { TalentCapability, TalentLearner } from '@/types/talent';

export type TalentTrail = Exclude<SkillFamily, 'other'>;
export const TALENT_TRAILS: readonly TalentTrail[] = ['html', 'css', 'js'];
export const CARD_SKILLS = 4;

export function parseTrail(value: string | null): TalentTrail | '' {
  return TALENT_TRAILS.find((trail) => trail === value) ?? '';
}

/** The board lists a card's skills in graph order; a card shows the furthest one first. */
export function advancedFirst(capabilities: readonly TalentCapability[]): TalentCapability[] {
  return [...capabilities].reverse();
}

/** The evidence tier of one skill of a card; `null` when its evidence states no share (or the board did not say). */
export function capabilityTier(capability: TalentCapability): EvidenceTier | null {
  return tierOf(parseShare(capability.graded));
}

export function cardTierCounts(capabilities: readonly TalentCapability[]): Record<EvidenceTier, number> | null {
  const counts: Record<EvidenceTier, number> = { top: 0, middle: 0, base: 0 };
  let seen = 0;
  for (const capability of capabilities) {
    const tier = capabilityTier(capability);
    if (!tier) continue;
    counts[tier] += 1;
    seen += 1;
  }
  return seen > 0 ? counts : null;
}

export function inTrail(capabilities: readonly TalentCapability[], trail: TalentTrail | ''): TalentCapability[] {
  return trail === '' ? [...capabilities] : capabilities.filter((entry) => skillFamily(entry.key) === trail);
}

/** The learners who proved at least one skill of the trail. No trail keeps everyone. */
export function learnersOfTrail(learners: readonly TalentLearner[], trail: TalentTrail | ''): TalentLearner[] {
  return trail === '' ? [...learners] : learners.filter((learner) => inTrail(learner.capabilities, trail).length > 0);
}

/** The trails in which at least one listed person proved a skill: a tab for any other trail would open an empty page. */
export function provenTrails(capabilities: readonly TalentCapability[]): Set<TalentTrail> {
  return new Set(TALENT_TRAILS.filter((trail) => capabilities.some((entry) => skillFamily(entry.key) === trail)));
}
