/** The learner's Tera companion: lives, equipped outfit, inventory. `companion` and `lives` edge functions. */
import { toBorder } from '@/services/crystalsNormalize';
import { toLivesUpdate, toSnapshot } from '@/services/shopNormalize';
import { callShop } from '@/services/shopTransport';
import type { CompanionSnapshot, LivesState, LivesUpdate } from '@/types/shop';

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});

/**
 * Fields the shared normalizer does not know yet: `max_lives` 10, a count ABOVE the maximum (a reserve
 * from a life pack) and `unlimited_until`. Read tolerantly from the raw block; the normalized value stays
 * when the field is absent.
 */
export function reviveLives(raw: unknown, lives: LivesState): LivesState {
  const r = row(raw);
  const max = typeof r.max_lives === 'number' && r.max_lives >= 1 ? Math.floor(r.max_lives) : lives.max;
  const current = typeof r.current === 'number' && r.current > lives.current ? Math.floor(r.current) : lives.current;
  const until = typeof r.unlimited_until === 'string' && r.unlimited_until ? r.unlimited_until : null;
  if (max === lives.max && current === lives.current && until === (lives.unlimitedUntil ?? null)) return lives;
  return { ...lives, max, current, nextRegenAt: current >= max ? null : lives.nextRegenAt, unlimitedUntil: until };
}

function toRevived(data: unknown, mocked: boolean): CompanionSnapshot {
  const snapshot = toSnapshot(data, mocked);
  const raw = row(data);
  const avatarRaw = row(raw.avatar);
  const lives = reviveLives(raw.lives, snapshot.lives);
  // The avatar block may carry the learner's profile border; absent keeps the value untouched.
  const withBorder = 'border' in avatarRaw ? { ...snapshot.avatar, border: toBorder(avatarRaw.border) } : snapshot.avatar;
  return lives === snapshot.lives && withBorder === snapshot.avatar ? snapshot : { ...snapshot, lives, avatar: withBorder };
}

export async function getCompanion(lang: string): Promise<CompanionSnapshot> {
  // The app's own reads never put the companion in a wallet before the certification: the server mints it once one is on chain.
  const { data, mocked } = await callShop('companion', { body: { lang, mint: 'after_credential' } });
  return toRevived(data, mocked);
}

/** Equips an owned outfit, or takes the current one off with `null`. */
export async function equipOutfit(outfit: string | null, lang: string): Promise<CompanionSnapshot> {
  const { data, mocked } = await callShop('companion', { body: { lang, equip: { outfit } } });
  return toRevived(data, mocked);
}

/** Wears a free avatar or an NFT avatar the learner owns. */
export async function equipAvatar(avatar: string, lang: string): Promise<CompanionSnapshot> {
  const { data, mocked } = await callShop('companion', { body: { lang, equip: { avatar } } });
  return toRevived(data, mocked);
}

function toRevivedUpdate(data: unknown): LivesUpdate {
  const update = toLivesUpdate(data);
  return { ...update, lives: reviveLives(row(data).lives, update.lives) };
}

/** One wrong answer. Idempotent on `attemptId`: the server charges an attempt once. */
export async function reportLifeLost(attemptId: string, activityId: string): Promise<LivesUpdate> {
  const { data } = await callShop('lives', { body: { action: 'lose', attempt_id: attemptId, activity_id: activityId } });
  return toRevivedUpdate(data);
}

export async function reportLessonEnd(lessonId: string, mistakes: number): Promise<LivesUpdate> {
  const { data } = await callShop('lives', { body: { action: 'lesson_end', lesson_id: lessonId, mistakes } });
  return toRevivedUpdate(data);
}
