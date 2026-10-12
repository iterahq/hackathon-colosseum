import { describe, expect, it } from 'vitest';
import type { ProgramDetail } from '@/types/content';
import type { BountyDetail, MyBountyStatus } from '@/types/bounty';
import { missionSkills } from './bountySkills';
import { judgedDays, lessonOfDay, questDays } from './questState';

const bounty = { requirement: { program: 'itera-v2', unitId: 'u2', trail: 'Week 2 · CSS', minDays: 3, totalDays: 5 }, postedBy: { kind: 'wallet', wallet: 'SPONSOR' } } as unknown as BountyDetail;
const status = (over: Partial<MyBountyStatus>): MyBountyStatus => ({ wallet: 'ME', eligible: false, reason: null, proof: null, judgedBefore: false, claim: null, busyElsewhere: false, notInvited: false, inviteeWallet: null, ...over });
const proof = (daysDone: number) => ({ asset: 'A', daysDone, explorerUrl: null });

describe('judgedDays', () => {
  it('is the days of the proof the gate read', () => {
    expect(judgedDays(bounty, status({ reason: 'not_enough_days', proof: proof(1) }))).toBe(1);
    expect(judgedDays(bounty, status({ eligible: true, proof: proof(5) }))).toBe(5);
  });

  it('is zero when the gate found no certification', () => {
    expect(judgedDays(bounty, status({ reason: 'no_certification' }))).toBe(0);
  });

  it('is null when nobody is being judged', () => {
    expect(judgedDays(bounty, null)).toBeNull();
    expect(judgedDays(bounty, undefined)).toBeNull();
    expect(judgedDays(bounty, status({ wallet: null, reason: 'no_wallet' }))).toBeNull();
    expect(judgedDays(bounty, status({ notInvited: true, reason: 'not_invited', proof: proof(5) }))).toBeNull();
    expect(judgedDays(bounty, status({ wallet: 'SPONSOR', proof: proof(5) }))).toBeNull();
    expect(judgedDays(bounty, status({ reason: 'not_enough_days' }))).toBeNull();
  });
});

describe('questDays', () => {
  const skills = missionSkills(bounty.requirement, 'en') ?? [];

  it('groups by day and marks stamped, next and locked', () => {
    const days = questDays(skills, 1);
    expect(days.map((day) => [day.day, day.state, day.skills.map((skill) => skill.id)])).toEqual([
      [1, 'done', ['css-rules', 'css-selectors']],
      [2, 'next', ['css-box', 'css-sizing']],
      [3, 'locked', ['css-flex-row', 'css-flex-align']],
    ]);
  });

  it('is all done past the minimum, starts at day 1 with nothing stamped, and neutral with nobody judged', () => {
    expect(questDays(skills, 5).map((day) => day.state)).toEqual(['done', 'done', 'done']);
    expect(questDays(skills, 0).map((day) => day.state)).toEqual(['next', 'locked', 'locked']);
    expect(questDays(skills, null).map((day) => day.state)).toEqual(['neutral', 'neutral', 'neutral']);
  });
});

describe('lessonOfDay', () => {
  const lesson = (id: string, statuses: string[]) => ({ id, activities: statuses.map((s, i) => ({ id: `${id}-${i}`, status: s })) });
  const program = { units: [{ id: 'u1', lessons: [lesson('x', ['done'])] }, { id: 'u2', lessons: [lesson('a', ['done', 'done']), lesson('empty', []), lesson('b', ['done', 'todo']), lesson('c', ['todo'])] }] } as unknown as ProgramDetail;

  it('counts only lessons that have activities, in order, inside the unit', () => {
    expect(lessonOfDay(program, 'u2', 1)).toEqual({ day: 1, lessonId: 'a', finished: true });
    expect(lessonOfDay(program, 'u2', 2)).toEqual({ day: 2, lessonId: 'b', finished: false });
    expect(lessonOfDay(program, 'u2', 3)).toEqual({ day: 3, lessonId: 'c', finished: false });
  });

  it('answers null with no program, an unknown unit or a day past the trail', () => {
    expect(lessonOfDay(null, 'u2', 1)).toBeNull();
    expect(lessonOfDay(program, 'nope', 1)).toBeNull();
    expect(lessonOfDay(program, 'u2', 4)).toBeNull();
  });
});
