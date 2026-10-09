import { localParts } from './awards.ts';

export const MAX_LIVES = 5;
export const REGEN_INTERVAL_SECONDS = 20 * 60;
export const XP_PER_LEVEL = 200;
const REGEN_INTERVAL_MS = REGEN_INTERVAL_SECONDS * 1000;

export interface LivesState {
  lives: number;
  maxLives: number;
  /** Start of the regeneration interval that is running. Irrelevant while full. */
  lastRegenAt: string;
}

export interface LivesView {
  current: number;
  max: number;
  next_regen_at: string | null;
  /** Seconds until the next life comes back; 0 when full. */
  regen_seconds: number;
  regen_interval_seconds: number;
}

/** Adds the lives that came back since `lastRegenAt`: one per interval, up to the maximum. */
export function regenerate(state: LivesState, now: Date): LivesState {
  const lives = Math.max(0, Math.min(state.lives, state.maxLives));
  if (lives >= state.maxLives) return { ...state, lives, lastRegenAt: now.toISOString() };
  const startedAt = Math.min(new Date(state.lastRegenAt).getTime(), now.getTime());
  const gained = Math.floor((now.getTime() - startedAt) / REGEN_INTERVAL_MS);
  const next = Math.min(state.maxLives, lives + gained);
  const lastRegenAt = next >= state.maxLives ? now : new Date(startedAt + gained * REGEN_INTERVAL_MS);
  return { ...state, lives: next, lastRegenAt: lastRegenAt.toISOString() };
}

/** A wrong answer: one life, never below zero. The caller makes it once per attempt id. */
export function loseLife(state: LivesState, now: Date): LivesState {
  const current = regenerate(state, now);
  return { ...current, lives: Math.max(0, current.lives - 1) };
}

/** A lesson finished without mistakes gives one life back, up to the maximum. */
export function grantLife(state: LivesState, now: Date): LivesState {
  const current = regenerate(state, now);
  return { ...current, lives: Math.min(current.maxLives, current.lives + 1) };
}

export function refillLives(state: LivesState, now: Date): LivesState {
  return { ...state, lives: state.maxLives, lastRegenAt: now.toISOString() };
}

export function livesView(state: LivesState, now: Date): LivesView {
  const current = regenerate(state, now);
  const full = current.lives >= current.maxLives;
  const nextAt = new Date(current.lastRegenAt).getTime() + REGEN_INTERVAL_MS;
  return {
    current: current.lives,
    max: current.maxLives,
    next_regen_at: full ? null : new Date(nextAt).toISOString(),
    regen_seconds: full ? 0 : Math.max(0, Math.ceil((nextAt - now.getTime()) / 1000)),
    regen_interval_seconds: REGEN_INTERVAL_SECONDS,
  };
}

export type LessonBonus = 'granted' | 'already_granted' | 'mistakes' | 'lesson_incomplete' | 'full';

/** Why a finished lesson does or does not give a life back. */
export function lessonBonus(facts: {
  mistakes: number;
  lessonComplete: boolean;
  alreadyGrantedToday: boolean;
  lives: number;
  maxLives: number;
}): LessonBonus {
  if (facts.mistakes > 0) return 'mistakes';
  if (!facts.lessonComplete) return 'lesson_incomplete';
  if (facts.alreadyGrantedToday) return 'already_granted';
  return facts.lives >= facts.maxLives ? 'full' : 'granted';
}

/** The idempotency key of the bonus: one per lesson per local day. */
export function lessonBonusAttemptId(lessonId: string, now: Date, timeZone: string): string {
  return `lesson:${lessonId}:${localParts(now.toISOString(), timeZone).date}`;
}

export interface XpEvent {
  amount: number;
  created_at: string;
}

export interface CompanionStats {
  level: number;
  xp: number;
  streak: number;
}

function previousDate(date: string): string {
  const previous = new Date(`${date}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

/**
 * Level, xp and streak from the xp ledger. Level is the header's rule
 * (`floor(xp / 200) + 1`). The streak is the run of consecutive local days with
 * xp that ends today, or yesterday when today has none yet.
 */
export function deriveStats(events: XpEvent[], now: Date, timeZone: string): CompanionStats {
  const xp = Math.max(0, events.reduce((sum, event) => sum + (Number.isFinite(event.amount) ? event.amount : 0), 0));
  const days = new Set(events.map((event) => localParts(event.created_at, timeZone).date));
  const today = localParts(now.toISOString(), timeZone).date;
  let cursor = days.has(today) ? today : previousDate(today);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = previousDate(cursor);
  }
  return { level: Math.floor(xp / XP_PER_LEVEL) + 1, xp, streak };
}
