/**
 * Guest-link code (plan 20260728-itera-guest-link-aula-sincrona, ADR-5).
 *
 * The guest link carries a SHORT per-session code — NOT the session UUID — so it
 * is revocable, rotatable, and unambiguous when read aloud or retyped from a
 * screenshot in the middle of a sales call.
 *
 * The alphabet deliberately drops every glyph pair a human confuses: `0`/`O`,
 * `1`/`l`/`I`. Lowercase is dropped wholesale for the same reason (an `l` next to
 * a `1` is a support ticket). 31 symbols ^ 8 chars ≈ 8.5e11 — far past guessable
 * for a code that ALSO only resolves while the class is `status='live'`.
 */

/** Unambiguous, URL-safe alphabet: no 0/O, no 1/l/I, uppercase only. */
export const GUEST_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const GUEST_CODE_LENGTH = 8;

/**
 * A fresh guest code. Uses `crypto.getRandomValues` when available (every
 * browser we ship to); the `Math.random` path exists only so the helper stays
 * usable in a non-crypto test/SSR context — it is never the production path.
 */
export function generateGuestCode(length = GUEST_CODE_LENGTH): string {
  const n = GUEST_CODE_ALPHABET.length;
  const out: string[] = [];
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint32Array(length);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < length; i += 1) out.push(GUEST_CODE_ALPHABET[bytes[i] % n]);
  } else {
    for (let i = 0; i < length; i += 1) out.push(GUEST_CODE_ALPHABET[Math.floor(Math.random() * n)]);
  }
  return out.join('');
}

/**
 * Shape check only — a code is AUTHORITATIVELY resolved server-side (itera-api),
 * never here. This exists so an obviously-malformed `/g/:code` fails fast in the
 * UI instead of burning a network round-trip.
 */
export function isValidGuestCode(code: string | undefined | null): boolean {
  if (!code) return false;
  if (code.length < 4 || code.length > 32) return false;
  return /^[A-Za-z0-9_-]+$/.test(code);
}
