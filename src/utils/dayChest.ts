/** Pure view of the chest of a day: what the panel under the stamp shows, if it shows at all. */
import type { Chest } from '@/types/tera';

export type ChestPhase = 'sealing' | 'committed' | 'rolling' | 'revealed';

/** After this many unanswered polls the panel stops asking: the chest is settled by the server and found again later. */
export const CHEST_MAX_POLLS = 40;
export const CHEST_POLL_MS = 1500;

interface Input {
  /** The feature answered `enabled`. */
  featureOn: boolean;
  /** The first answer about this day's chest has arrived. */
  answered: boolean;
  chest: Chest | null;
}

/** Null: nothing is drawn, the end of the day looks as it did before chests existed. */
export function chestPhase({ featureOn, answered, chest }: Input): ChestPhase | null {
  if (!featureOn) return null;
  if (!answered) return 'sealing';
  if (!chest || chest.status === 'failed') return null;
  if (chest.status === 'minted' && chest.tera) return 'revealed';
  if (chest.status === 'rolling' || chest.seed) return 'rolling';
  return chest.commit ? 'committed' : 'sealing';
}

/** How long until the next poll, or false when there is nothing left to wait for. */
export function chestPollMs(chest: Chest | null | undefined, polls: number): number | false {
  if (!chest || polls >= CHEST_MAX_POLLS) return false;
  if (chest.status !== 'committed' && chest.status !== 'rolling') return false;
  return Math.min(5000, Math.max(600, chest.retryAfterMs ?? CHEST_POLL_MS));
}

const EARN_ONLY_FALLBACK: ReadonlySet<string> = new Set(['legendary', 'mythic', 'primordial']);

/** The rarity key the reveal is coloured by: the Tera's own tier, else the tier the roll landed on. */
export const chestRarity = (chest: Chest | null): string | null => chest?.tera?.rarity || chest?.tier || null;

/** Whether the Tera that came out is of a tier that is never for sale. `earnOnly` is the catalog's list when it is known. */
export const isEarnOnlyTier = (rarity: string | null, earnOnly: ReadonlySet<string> = EARN_ONLY_FALLBACK): boolean => Boolean(rarity) && earnOnly.has(rarity as string);

/** The chest of a lesson's day among the learner's chests: a read, never a request to open one. */
export const chestOfLesson = (chests: readonly Chest[], lessonId: string | undefined): Chest | null => (lessonId ? (chests.find((c) => c.lessonId === lessonId) ?? null) : null);
