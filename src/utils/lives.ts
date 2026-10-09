/** Pure lives logic: the optimistic loss, client-side regeneration, the gate predicates and the countdown text. */
import type { LivesState } from '@/types/shop';

export const DEFAULT_MAX_LIVES = 5;
export const DEFAULT_REGEN_SECONDS = 20 * 60;

/** One life gone. Starts the regeneration clock when the bar was full; never goes below zero. */
export function loseLife(lives: LivesState, now: number): LivesState {
  if (lives.current <= 0) return lives;
  const nextRegenAt = lives.nextRegenAt ?? new Date(now + lives.regenSeconds * 1000).toISOString();
  return { ...lives, current: lives.current - 1, nextRegenAt };
}

/** The lives the learner has at `now`, counting every regeneration tick that has already passed. */
export function regenerate(lives: LivesState, now: number): LivesState {
  if (lives.current >= lives.max) return lives.nextRegenAt ? { ...lives, nextRegenAt: null } : lives;
  const next = lives.nextRegenAt ? Date.parse(lives.nextRegenAt) : NaN;
  if (!Number.isFinite(next) || next > now || lives.regenSeconds <= 0) return lives;
  const step = lives.regenSeconds * 1000;
  const gained = Math.min(lives.max - lives.current, 1 + Math.floor((now - next) / step));
  const current = lives.current + gained;
  return { ...lives, current, nextRegenAt: current >= lives.max ? null : new Date(next + gained * step).toISOString() };
}

export function secondsToNextLife(lives: LivesState, now: number): number {
  if (lives.current >= lives.max || !lives.nextRegenAt) return 0;
  const next = Date.parse(lives.nextRegenAt);
  return Number.isFinite(next) ? Math.max(0, Math.ceil((next - now) / 1000)) : 0;
}

/** 754 -> "12:34". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export interface LivesEligibility {
  signedIn: boolean;
  /** A live-class link user: an anonymous session with no account behind it. */
  guest: boolean;
  /** The author test harness or any surface that must write nothing. */
  harness: boolean;
  /** The companion read answered. False while loading, missing or failing. */
  backendReady: boolean;
  /** A lives write failed in this session: the mechanic stands down until reload. */
  broken: boolean;
}

/** Lives are real only for a signed-in learner whose backend answers. Everything else keeps the decorative hearts. */
export function livesActive(e: LivesEligibility): boolean {
  return e.signedIn && !e.guest && !e.harness && e.backendReady && !e.broken;
}

export interface GateInput {
  active: boolean;
  lives: number | null;
  /** The verdict footer is up: the learner is still reading the miss that cost the last life. */
  reviewingVerdict: boolean;
  lessonCompleted: boolean;
}

/** The out-of-lives pause: zero lives on a live mechanic, once the verdict has been read and the lesson is not over. */
export function showLivesGate({ active, lives, reviewingVerdict, lessonCompleted }: GateInput): boolean {
  return active && lives !== null && lives <= 0 && !reviewingVerdict && !lessonCompleted;
}
