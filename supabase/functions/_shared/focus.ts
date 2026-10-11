/**
 * The hackathon build shows one loop: learn, prove, earn. With the focus on (the default; the secret
 * `ITERA_FOCUS_BUILD=off` turns it off and brings every rule below back), the server does not run the
 * side systems the app no longer shows. Nothing is deleted: tables, rows and code stay.
 */
const env = (globalThis as { Deno?: { env: { get(name: string): string | undefined } } }).Deno?.env.get('ITERA_FOCUS_BUILD');

export const FOCUS_BUILD = env !== 'off';

/** A miss the server graded costs a life. Off in the focus build: a wrong answer is redone, nothing is lost. */
export const MISS_COSTS_LIFE = !FOCUS_BUILD;

/** Medals are minted as their own NFTs. Off in the focus build: the certification is the only thing a finished day writes to a wallet. */
export const MEDALS_MINTED = !FOCUS_BUILD;

/** The companion NFT is minted once a certification is on chain. Off in the focus build: only a purchase the companion wears mints it. */
export const COMPANION_FOLLOWS_CREDENTIAL = !FOCUS_BUILD;
