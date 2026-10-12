/**
 * The hackathon build shows one loop, learn -> prove -> own, and nothing beside it.
 *
 * `FOCUS_BUILD` is on unless the build sets `VITE_FOCUS_BUILD=off`. With it on, the learner UI hides the
 * video courses, the live classes and their staff entry points, the subscription pages, the crystals,
 * the invite card, the class podium and the leaderboards. Nothing is deleted: the routes of a hidden
 * surface send the learner to the dashboard, the server code and the data stay, and turning the flag off
 * brings every surface back. Staff routes (/admin, /author, /live/instructor) keep working by URL.
 */
export const FOCUS_BUILD = (import.meta.env.VITE_FOCUS_BUILD as string | undefined) !== 'off';

/**
 * Learner routes a focus build sends to the dashboard. Staff routes are not here on purpose.
 * `/gift/:wallet` offers one thing, the life gift, and lives are off; `/prototipo/cena` is an inherited prototype.
 */
export const FOCUS_HIDDEN_PATHS = ['/catalog', '/course/:slug', '/subscribe', '/subscribe/return', '/gift/:wallet', '/prototipo/cena'] as const;

/** The one thing the learner collects: days stamped and capabilities proven. XP, level and streak stay out of the story. */
export const FOCUS_ONE_PROGRESS_STORY = FOCUS_BUILD;

/** The shop takes SOL only: no crystal price, no crystal balance, no crystal button. */
export const FOCUS_SOL_ONLY_SHOP = FOCUS_BUILD;

/**
 * Lives are off: no hearts in the header, the lesson or the shop, no life packs, no gift-a-life block, no
 * "you lost a life" note. A miss is redone, nothing is lost. The server stops charging a life under the same flag.
 */
export const FOCUS_LIVES_OFF = FOCUS_BUILD;

/**
 * The shop sells the Teras (the three tiers for sale; the earn-only tiers are listed with no price) and what the
 * certification shows (the inks and frames of the credential). The wardrobe and the profile wear only what is owned or
 * a starter face.
 */
export const FOCUS_SHOP_KINDS: ReadonlySet<string> = new Set(['avatar', 'ink', 'frame']);
export const FOCUS_SHOP_ONLY = FOCUS_BUILD;

/**
 * The paid Tera shelf is ON (call of 2026-10-12: the demo buys an avatar with SOL): the three tiers for sale (Tera,
 * Super Tera, Mega Tera) are listed and bought in the shop. A build with `VITE_PAID_TERAS=off` hides them again, and
 * with them the "transferable" and "resale fee" wording there, on the landing and in the world; a Tera a wallet already
 * bought stays in its wardrobe and on its profile. Only the UI changes: the routes, the `purchase-*` functions and the
 * chest are the same either way.
 */
export const FOCUS_PAID_TERAS_OFF = FOCUS_BUILD && (import.meta.env.VITE_PAID_TERAS as string | undefined) === 'off';

/**
 * A Tera is either earned by studying or bought: the faces every learner starts with are not a category of their own.
 * The shop does not list them and nothing is labelled "free" (the world leaves them out of its cast under `FOCUS_BUILD`);
 * the picker of the profile still offers them as the starter faces, so an account with no Tera yet has a picture.
 */
export const FOCUS_STARTER_FACES_UNLISTED = FOCUS_BUILD;

/**
 * The story a visitor meets is learn -> prove -> own (call of 2026-10-12): the bounties, the escrow, the talent board
 * and the direct missions are out of the landing and the learner home. Their routes, pages and code stay and answer
 * by URL; a build with `VITE_FOCUS_BUILD=off` shows them again.
 */
export const FOCUS_EARN_STORY_OFF = FOCUS_BUILD;

/**
 * A day node of the program path carries no kind label ("X-RAY", "CONCEPT", "CODE"): the label is the kind of the
 * day's FIRST activity only, and a day mixes several kinds, so it described the day wrongly.
 */
export const FOCUS_DAY_KIND_LABEL_OFF = FOCUS_BUILD;
