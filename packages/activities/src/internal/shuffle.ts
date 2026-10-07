/**
 * PER-LEARNER, DETERMINISTIC option shuffling — with the learner half of the
 * seed INJECTED rather than read out of the host's storage.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE COUPLING THE PLAN'S TABLE MISSED
 * ─────────────────────────────────────────────────────────────────────────────
 * The plan's audit counted `@/i18n`, `@/api/iteraApi`, `@/auth/AuthContext` and
 * the pure utils. `learnerShuffle` looked pure and was not: it called
 * `currentStorageScope()`, which reads the Itera user id out of `localStorage`
 * under the `itera.` prefix that the Player's sign-out clears. A "pure util"
 * that reads the host's session storage is a host dependency wearing a
 * function's clothes — and it is the one that would have been hardest to spot
 * from an external app, because it does not fail. It silently gives every
 * learner in that app the SAME permutation, which is the shuffle not existing.
 *
 * So the scope is a parameter here, and the host supplies it:
 *   • the Itera Player passes `currentStorageScope()` — byte-identical to
 *     before (`src/utils/learnerShuffle.ts` is now that adapter);
 *   • any other host passes `identity.userId`;
 *   • with neither, `resolveLearnerScope` mints a per-browser anon id under the
 *     SAME `itera.shuffle.anon` key the app used, so the fallback path is also
 *     unchanged.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT "DETERMINISTIC" MUST NOT MEAN
 * ─────────────────────────────────────────────────────────────────────────────
 * Shuffling exists for a PEDAGOGICAL reason: two learners side by side must not
 * be able to copy "it's the third one". So the seed is per (learner, activity):
 * the same learner on the same activity always sees the same order; different
 * learners see different orders. A seed derived from the activity alone would
 * collapse into "everyone sees the same order".
 */
import { seededShuffle } from './seededShuffle.js';

/** Same `itera.` prefix as the rest of the scoped storage, so sign-out clears it. */
const ANON_SCOPE_KEY = 'itera.shuffle.anon';

/** In-memory fallback for when localStorage is unavailable (SSR, private mode). */
let memoryAnonScope: string | null = null;

function randomId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * A stable-per-browser id used only when the real learner id is unknown. It is
 * NOT an identity and never leaves the device — its only job is to keep two
 * browsers from agreeing on a permutation.
 */
export function anonLearnerScope(): string {
  try {
    const stored = globalThis.localStorage?.getItem(ANON_SCOPE_KEY);
    if (stored) return stored;
    const fresh = randomId();
    globalThis.localStorage?.setItem(ANON_SCOPE_KEY, fresh);
    return fresh;
  } catch {
    // Storage unavailable: stay stable for the life of the tab at least.
    memoryAnonScope ??= randomId();
    return memoryAnonScope;
  }
}

/** The learner half of the seed: what the host knows, else a per-browser id. */
export function resolveLearnerScope(explicit?: string | null): string {
  return explicit || anonLearnerScope();
}

/**
 * The full seed for one shuffled collection.
 *
 * `salt` separates independent collections inside the SAME activity — `match`
 * shuffles its two columns independently, and without a salt both columns would
 * be driven by the same seed.
 */
export function learnerShuffleSeed(
  scope: string,
  activityId: string | undefined,
  salt = '',
): string {
  return `${scope}::${activityId ?? 'unknown-activity'}${salt ? `::${salt}` : ''}`;
}

/**
 * A label that only POINTS at something the prompt shows — `A`, `**B**`,
 * `(C)`, `2.` — instead of carrying an answer of its own.
 */
const REFERENCE_LABEL = /^\(?\**\s*([A-Za-z]|\d{1,2})\s*\**[).:]?\)?$/;

/**
 * The same pointer with one naming word in front — `Lista A`, `List B`,
 * `Opção 2`. Group 1 is the word, group 2 the marker.
 */
const NAMED_REFERENCE_LABEL = /^\(?\**\s*(\p{L}{2,})\s+([A-Za-z]|\d{1,2})\s*\**[).:]?\)?$/u;

/**
 * `Lista A`, `Lista B`, `Lista C`: one shared word, markers that are exactly
 * the first letters or the first numbers, and every label written in the prompt
 * — which is what a pointer is. The last condition keeps real answers
 * shuffling: `Classe A` / `Classe B` / `Classe C` under "which class is this
 * address?" names nothing the prompt shows.
 */
function isNamedReferenceSet(labels: readonly string[], prompt: string): boolean {
  const parts = labels.map((label) => NAMED_REFERENCE_LABEL.exec(label));
  if (parts.some((p) => !p)) return false;
  const shown = prompt.toLowerCase();
  if (!parts.every((p) => shown.includes(`${p![1]} ${p![2]}`.toLowerCase()))) return false;
  const words = new Set(parts.map((p) => p![1]!.toLowerCase()));
  if (words.size !== 1) return false;
  const markers = parts.map((p) => p![2]!.toUpperCase()).sort();
  const letters = labels.map((_, i) => String.fromCharCode(65 + i));
  const numbers = labels.map((_, i) => String(i + 1)).sort();
  return markers.join() === letters.join() || markers.join() === numbers.join();
}

/**
 * True when every option is only a reference label (`A`, `B`, `C` for the
 * `**A**`, `**B**`, `**C**` blocks of the instruction, or `Lista A`, `Lista B`
 * for blocks the `prompt` titles that way). Such options mean
 * nothing by position — the answer lives in the blocks, which do not move — so
 * shuffling them only prints `B, A, C` and makes the learner hunt. Options with
 * media are never references.
 */
export function isReferenceLabelSet(
  options: readonly { label?: string | null; image_url?: string | null; audio_url?: string | null }[],
  prompt = '',
): boolean {
  if (options.length < 2) return false;
  if (!options.every((o) => !o.image_url && !o.audio_url && typeof o.label === 'string')) return false;
  const labels = options.map((o) => (o.label as string).trim());
  return labels.every((label) => REFERENCE_LABEL.test(label)) || isNamedReferenceSet(labels, prompt);
}

/**
 * The option order a choice kind shows: authored when the labels are only
 * references (see `isReferenceLabelSet`), else the per-learner shuffle.
 */
export function learnerOptionOrder<T extends { label?: string | null; image_url?: string | null; audio_url?: string | null }>(
  options: readonly T[],
  scope: string,
  activityId: string | undefined,
  prompt = '',
): T[] {
  return isReferenceLabelSet(options, prompt) ? [...options] : learnerShuffle(options, scope, activityId);
}

/** Shuffle `items` deterministically for THIS learner and THIS activity. */
export function learnerShuffle<T>(
  items: readonly T[],
  scope: string,
  activityId: string | undefined,
  salt = '',
): T[] {
  return seededShuffle(items, learnerShuffleSeed(scope, activityId, salt));
}

/**
 * Shuffle for the ORDER kind, with one extra guarantee: the arrangement the
 * learner is handed is NEVER already the solution.
 *
 * Without it, a learner could be handed the correct sequence by chance and
 * "score" without composing anything — a 1-in-6 event on a 3-step activity,
 * i.e. routine, not exotic. For any set of ≥2 items another permutation always
 * exists, so this is always satisfiable; a 0- or 1-item list has no other
 * permutation and is returned as-is.
 *
 * Determinism is preserved: the retry ladder is derived from the same seed.
 */
export function learnerShuffleAvoidingSolution(
  ids: readonly string[],
  scope: string,
  activityId: string | undefined,
  solution: readonly string[],
): string[] {
  const isSolution = (candidate: readonly string[]) =>
    candidate.length === solution.length && candidate.every((id, i) => id === solution[i]);

  if (ids.length < 2) return [...ids];

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const salt = attempt === 0 ? 'order' : `order#${attempt}`;
    const candidate = seededShuffle(ids, learnerShuffleSeed(scope, activityId, salt));
    if (!isSolution(candidate)) return candidate;
  }

  // Astronomically unlikely to be reached; still, never return the answer key.
  // Swapping the first two elements of a sequence always changes it (n ≥ 2).
  const forced = seededShuffle(ids, learnerShuffleSeed(scope, activityId, 'order'));
  [forced[0], forced[1]] = [forced[1], forced[0]];
  return forced;
}
