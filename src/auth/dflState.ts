/**
 * State binding for "Sign in with DFL" (login-CSRF defence). A nonce is stored
 * in this browser when the sign-in starts and rides inside `next`, which the DFL
 * handoff page passes back unchanged; the callback only exchanges a token when
 * the nonce it reads matches the stored one. The `return` URL is NOT touched.
 *
 * The key deliberately does not start with `itera.`: clearIteraStorage() wipes that
 * prefix on sign-out, which would kill a pending sign-in started in this tab. The TTL
 * (60 min, DFL sign-up with e-mail confirmation is slow) only bounds a stale entry;
 * the nonce match is the control.
 * localStorage, not sessionStorage: on Android the WebView can be re-created
 * between the start and the return. Fails closed when storage is unavailable.
 * Nothing here is ever logged.
 */
import { safeInternalPath } from '@/lib/safeInternalPath';

export const DFL_STATE_KEY = 'iterahq.dfl.state';
export const DFL_STATE_TTL_MS = 60 * 60 * 1000;

type StateStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const WRAPPED = /^\/~([A-Za-z0-9_-]{22})(\/.*)$/;

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Makes a nonce, stores it with its start time (overwriting any older one) and returns it. */
export function createDflState(
  storage: StateStorage,
  now: number,
  random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b),
): string {
  const nonce = base64url(random(new Uint8Array(16)));
  try {
    storage.setItem(DFL_STATE_KEY, JSON.stringify({ nonce, at: now }));
  } catch {
    /* storage unavailable: nothing stored, consume() will refuse */
  }
  return nonce;
}

export function wrapNext(nonce: string, next: string): string {
  return `/~${nonce}${safeInternalPath(next)}`;
}

export function unwrapNext(raw: string | null | undefined): { nonce: string; next: string } | null {
  if (typeof raw !== 'string') return null;
  const m = WRAPPED.exec(raw);
  if (!m) return null;
  return { nonce: m[1], next: safeInternalPath(m[2]) };
}

/** One-shot: always removes the stored entry. True only for a fresh entry with the same nonce. */
export function consumeDflState(storage: StateStorage, now: number, nonce: unknown): boolean {
  let raw: string | null = null;
  try {
    raw = storage.getItem(DFL_STATE_KEY);
  } catch {
    return false;
  }
  try {
    storage.removeItem(DFL_STATE_KEY);
  } catch {
    /* ignore */
  }
  if (typeof nonce !== 'string' || raw === null) return false;
  let entry: unknown;
  try {
    entry = JSON.parse(raw);
  } catch {
    return false;
  }
  if (typeof entry !== 'object' || entry === null) return false;
  const { nonce: stored, at } = entry as { nonce?: unknown; at?: unknown };
  if (typeof stored !== 'string' || typeof at !== 'number') return false;
  const age = now - at;
  if (!(age >= 0 && age < DFL_STATE_TTL_MS)) return false;
  return stored === nonce;
}
