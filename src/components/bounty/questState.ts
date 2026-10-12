import { isSponsor } from '@/utils/bountyAction';
import type { ProgramDetail } from '@/types/content';
import type { BountyDetail, MyBountyStatus } from '@/types/bounty';
import type { MissionSkill } from '@/components/bounty/bountySkills';

type QuestBounty = Pick<BountyDetail, 'requirement'> & { postedBy?: BountyDetail['postedBy'] };

/**
 * The stamped days the gate read for this wallet, or null when nobody is being judged (signed out, no wallet, the sponsor,
 * a wallet the bounty is not for). It is the gate's own answer: its proof, or zero when it found no certification.
 */
export function judgedDays(bounty: QuestBounty, status: MyBountyStatus | null | undefined): number | null {
  if (!status || !status.wallet || status.notInvited || isSponsor(bounty, status)) return null;
  if (status.proof) return Math.max(0, status.proof.daysDone);
  return status.reason === 'no_certification' ? 0 : null;
}

export interface QuestDay {
  day: number;
  skills: MissionSkill[];
  state: 'done' | 'next' | 'locked' | 'neutral';
}

/** The required skills by day: stamped, the next one to stamp, the ones after it. */
export function questDays(skills: readonly MissionSkill[], daysDone: number | null): QuestDay[] {
  const days = [...new Set(skills.map((skill) => skill.day))].sort((a, b) => a - b);
  return days.map((day) => ({
    day,
    skills: skills.filter((skill) => skill.day === day),
    state: daysDone === null ? 'neutral' : day <= daysDone ? 'done' : day === daysDone + 1 ? 'next' : 'locked',
  }));
}

export interface NextLesson {
  day: number;
  lessonId: string;
  /** Finished in the app while the gate does not count it yet: the stamp is what is missing, not the study. */
  finished: boolean;
}

/** The lesson of a trail's day, counted as the server counts days: lessons that have activities, in order. */
export function lessonOfDay(program: Pick<ProgramDetail, 'units'> | null | undefined, unitId: string, day: number): NextLesson | null {
  const unit = program?.units.find((entry) => entry.id === unitId);
  const counted = (unit?.lessons ?? []).filter((lesson) => (lesson.activities ?? []).length > 0);
  const lesson = counted[day - 1];
  if (!lesson) return null;
  const finished = (lesson.activities ?? []).every((activity) => activity.status === 'done' || (activity.status as string) === 'completed');
  return { day, lessonId: lesson.id, finished };
}
