/** The learner's Tera companion: lives, equipped outfit, inventory. `companion` and `lives` edge functions. */
import { toLivesUpdate, toSnapshot } from '@/services/shopNormalize';
import { callShop } from '@/services/shopTransport';
import type { CompanionSnapshot, LivesUpdate } from '@/types/shop';

export async function getCompanion(lang: string): Promise<CompanionSnapshot> {
  const { data, mocked } = await callShop('companion', { body: { lang } });
  return toSnapshot(data, mocked);
}

/** Equips an owned outfit, or takes the current one off with `null`. */
export async function equipOutfit(outfit: string | null, lang: string): Promise<CompanionSnapshot> {
  const { data, mocked } = await callShop('companion', { body: { lang, equip: { outfit } } });
  return toSnapshot(data, mocked);
}

/** Wears a free avatar or an NFT avatar the learner owns. */
export async function equipAvatar(avatar: string, lang: string): Promise<CompanionSnapshot> {
  const { data, mocked } = await callShop('companion', { body: { lang, equip: { avatar } } });
  return toSnapshot(data, mocked);
}

/** One wrong answer. Idempotent on `attemptId`: the server charges an attempt once. */
export async function reportLifeLost(attemptId: string, activityId: string): Promise<LivesUpdate> {
  const { data } = await callShop('lives', { body: { action: 'lose', attempt_id: attemptId, activity_id: activityId } });
  return toLivesUpdate(data);
}

export async function reportLessonEnd(lessonId: string, mistakes: number): Promise<LivesUpdate> {
  const { data } = await callShop('lives', { body: { action: 'lesson_end', lesson_id: lessonId, mistakes } });
  return toLivesUpdate(data);
}
