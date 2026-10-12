import { claimsOfDay, graphOf, type CapabilityGraph } from '../../../supabase/functions/_shared/capability-graph';
import { skillShortTitle } from '@/components/skills/skillLabels';
import type { SkillBadgeState } from '@/components/skills/skillIcon';

export interface MissionSkill {
  id: string;
  /** The day of the trail whose stamp proves it. */
  day: number;
  /** Two words, for the badge. */
  title: string;
  /** The claim as the capability graph words it. */
  hint: string;
}

export interface RequirementInput {
  program: string | null | undefined;
  /** The trail's title, in any language the graph carries. */
  trail: string | null | undefined;
  minDays: number;
}

function trailOrdinal(graph: CapabilityGraph, trail: string | null | undefined): number | null {
  if (!trail) return null;
  const index = graph.trails.findIndex((titles) => Object.values(titles).includes(trail));
  return index >= 0 ? index : null;
}

const pick = (text: Record<string, string>, locale: string): string => text[locale] ?? text.en ?? Object.values(text)[0] ?? '';

/**
 * The skills a requirement asks for: what days 1..minDays of its trail prove. The app opens a trail's days in order,
 * so N stamped days are the first N. Null when the trail is not in the capability graph: the caller then shows the days alone.
 */
export function missionSkills(requirement: RequirementInput, locale: string): MissionSkill[] | null {
  const graph = graphOf(requirement.program);
  if (!graph) return null;
  const trail = trailOrdinal(graph, requirement.trail);
  if (trail === null || !Number.isInteger(requirement.minDays) || requirement.minDays < 1) return null;
  const skills: MissionSkill[] = [];
  for (let day = 1; day <= requirement.minDays; day += 1) {
    for (const claim of claimsOfDay(graph, trail, day)) {
      const hint = pick(claim.title, locale);
      skills.push({ id: claim.id, day, title: skillShortTitle(claim.id, locale, hint), hint });
    }
  }
  return skills.length > 0 ? skills : null;
}

/** Lit up to the stamped days the gate read; `null` days (nobody is being judged) is neutral. */
export function skillState(skill: Pick<MissionSkill, 'day'>, daysDone: number | null): SkillBadgeState {
  if (daysDone === null) return 'neutral';
  return skill.day <= daysDone ? 'lit' : 'locked';
}

/** What the card shows first: the latest days, which say the most about the work, then how many are left out. */
export function skillPreview(skills: readonly MissionSkill[], max: number): { shown: MissionSkill[]; more: number } {
  if (skills.length <= max) return { shown: [...skills], more: 0 };
  return { shown: skills.slice(-max), more: skills.length - max };
}
