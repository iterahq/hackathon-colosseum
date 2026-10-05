/**
 * The handshake session token and the ask id of the shell router, from the random source the host
 * supplies (PLAN R-12): `app/[...path].tsx` passes `getRandomValues` of `expo-crypto`. The router's own
 * defaults are `Math.random`; the session token is what a call must carry, so a shell that takes
 * `auth.session` never uses them.
 *
 * Pure TypeScript: no React Native import.
 */

/** Fills the array in place with cryptographically strong random bytes. */
export type FillRandom = (bytes: Uint8Array) => unknown;

const HEX = '0123456789abcdef';

function randomHex(fill: FillRandom, byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  fill(bytes);
  // A source that wrote nothing would give every page load the same token.
  if (bytes.every((b) => b === 0)) throw new Error('the random source returned no bytes');
  let out = '';
  for (const b of bytes) out += HEX[b >> 4] + HEX[b & 15];
  return out;
}

/** `s` + 64 hex characters (256 bits). */
export const sessionTokenSource = (fill: FillRandom) => (): string => `s${randomHex(fill, 32)}`;

/** `n` + 32 hex characters: the form of `NATIVE_ID`. */
export const askIdSource = (fill: FillRandom) => (): string => `n${randomHex(fill, 16)}`;
