/**
 * The hackathon build shows one loop, learn -> prove -> earn, and nothing beside it.
 *
 * `FOCUS_BUILD` is on unless the build sets `VITE_FOCUS_BUILD=off`. With it on, the learner UI hides the
 * video courses, the live classes and their staff entry points, the subscription pages, the crystals,
 * the invite card, the class podium and the leaderboards. Nothing is deleted: the routes of a hidden
 * surface send the learner to the dashboard, the server code and the data stay, and turning the flag off
 * brings every surface back. Staff routes (/admin, /author, /live/instructor) keep working by URL.
 */
export const FOCUS_BUILD = (import.meta.env.VITE_FOCUS_BUILD as string | undefined) !== 'off';

/** Learner routes a focus build sends to the dashboard. Staff routes are not here on purpose. */
export const FOCUS_HIDDEN_PATHS = ['/catalog', '/course/:slug', '/subscribe', '/subscribe/return'] as const;

/** The one thing the learner collects: days stamped and capabilities proven. XP, level and streak stay out of the story. */
export const FOCUS_ONE_PROGRESS_STORY = FOCUS_BUILD;

/** The shop takes SOL only: no crystal price, no crystal balance, no crystal button. */
export const FOCUS_SOL_ONLY_SHOP = FOCUS_BUILD;

/**
 * Lives are off: no hearts in the header, the lesson or the shop, no life packs, no gift-a-life block, no
 * "you lost a life" note. A miss is redone, nothing is lost. The server stops charging a life under the same flag.
 */
export const FOCUS_LIVES_OFF = FOCUS_BUILD;

/** The shop sells what the certification shows: avatars and the inks and frames of the credential. */
export const FOCUS_SHOP_KINDS: ReadonlySet<string> = new Set(['avatar', 'ink', 'frame']);
export const FOCUS_SHOP_ONLY = FOCUS_BUILD;
