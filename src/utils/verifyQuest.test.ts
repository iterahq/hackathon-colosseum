import { describe, expect, it } from 'vitest';
import { QUEST_TARGETS, questProgress } from '@/utils/verifyQuest';

describe('questProgress', () => {
  it('starts with nothing opened', () => {
    expect(questProgress(new Set())).toEqual({ done: 0, total: 3, byId: { program: false, soulbound: false, gate: false } });
  });

  it('counts only the three quest targets', () => {
    const progress = questProgress(new Set(['program', 'trust', 'rpc']));
    expect(progress.done).toBe(1);
    expect(progress.byId.program).toBe(true);
    expect(progress.byId.gate).toBe(false);
  });

  it('reaches the total when every target is opened', () => {
    expect(questProgress(new Set(QUEST_TARGETS)).done).toBe(3);
  });
});
