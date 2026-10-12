export const QUEST_TARGETS = ['program', 'soulbound', 'gate'] as const;

export type QuestTarget = (typeof QUEST_TARGETS)[number];

export function questProgress(opened: ReadonlySet<string>): { done: number; total: number; byId: Record<QuestTarget, boolean> } {
  const byId = { program: opened.has('program'), soulbound: opened.has('soulbound'), gate: opened.has('gate') };
  return { done: QUEST_TARGETS.filter((id) => byId[id]).length, total: QUEST_TARGETS.length, byId };
}
