/**
 * The development probe of PLAN row R-12: one read of the backend as the signed-in learner, with the
 * access token the page handed over (`nativeSession.ts`). It calls the RPC `current_itera_user_id` of
 * schema `itera`, the same call the web makes in `src/services/iteraUser.ts`, and reports the id.
 * `app/[...path].tsx` runs it under `__DEV__` only and shows the result in the dev overlay.
 *
 * This file and `shellGate.ts` are the only ones in the shell that may contain a network call
 * (one-copy rule 1b). It talks to ONE host: the https origin of `EXPO_PUBLIC_SUPABASE_URL`, with a path
 * that is a constant. Both `EXPO_PUBLIC_*` values are public by definition: Metro inlines them into the
 * bundle, exactly as Vite inlines the web's `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The anon
 * key grants nothing without row-level security; a service-role key is refused here (`parseBackend`).
 *
 * Nothing that leaves this file carries the token, the anon key or a response body.
 *
 * Pure TypeScript: no React Native import.
 */
import { base64DecodedLength, decodeBase64Into } from '@iterahq/shell-bridge';
import { originOf } from './origin';

export interface Backend {
  /** `https://<host>`: the only host the probe talks to. */
  origin: string;
  anonKey: string;
}

export const PROBE_PATH = '/rest/v1/rpc/current_itera_user_id';
export const PROBE_TIMEOUT_MS = 8000;
const MAX_KEY_CHARS = 4096;
const MAX_BODY_CHARS = 256;
const KEY_SHAPE = /^[A-Za-z0-9._-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The `role` claim of a legacy JWT key, or null for an opaque key (`sb_publishable_...`). */
function roleOfKey(key: string): string | null {
  const part = key.split('.')[1];
  if (part === undefined || part.length % 4 === 1) return null;
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
  try {
    const bytes = new Uint8Array(base64DecodedLength(b64));
    decodeBase64Into(b64, bytes, 0);
    let text = '';
    for (const b of bytes) text += String.fromCharCode(b);
    const role = (JSON.parse(text) as { role?: unknown }).role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}

/**
 * The backend this build names, or null (the probe then reports `not-configured`). Refused: anything
 * that is not a bare https origin (a path, a query, user info, plain http), an empty or malformed key,
 * and a key that is not the public one (`sb_secret_...`, or a JWT whose role is not `anon`).
 */
export function parseBackend(url: unknown, anonKey: unknown): Backend | null {
  if (typeof url !== 'string' || typeof anonKey !== 'string') return null;
  const trimmed = url.trim().replace(/\/$/, '');
  const origin = originOf(trimmed);
  if (origin === null || !origin.startsWith('https://') || origin !== trimmed.toLowerCase()) return null;
  const key = anonKey.trim();
  if (key === '' || key.length > MAX_KEY_CHARS || !KEY_SHAPE.test(key) || key.startsWith('sb_secret_')) return null;
  const role = roleOfKey(key);
  if (key.includes('.') ? role !== 'anon' : !key.startsWith('sb_publishable_')) return null;
  return { origin, anonKey: key };
}

export type ProbeResult =
  | { kind: 'ok'; iteraUserId: string }
  /** The backend answered, and this account has no `itera.users` row. */
  | { kind: 'no-user' }
  | { kind: 'no-session' }
  | { kind: 'not-configured' }
  | { kind: 'failed'; status: number | null };

export interface ProbeResponse {
  ok: boolean;
  status: number;
  url?: string;
  text(): Promise<string>;
}
export type ProbeFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; cache: 'no-store'; signal?: AbortSignal },
) => Promise<ProbeResponse>;

/**
 * Ask the backend who the token is. `getAccessToken` is the native session's: it gives a token with life
 * left, asks the page for a fresh one otherwise, and null when there is none. Never throws, never waits
 * longer than `timeoutMs`.
 */
export async function probeIteraUser(
  backend: Backend | null,
  getAccessToken: () => Promise<string | null>,
  fetchImpl: ProbeFetch = (url, init) => fetch(url, init),
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<ProbeResult> {
  if (backend === null) return { kind: 'not-configured' };
  let token: string | null;
  try {
    token = await getAccessToken();
  } catch {
    token = null;
  }
  if (token === null) return { kind: 'no-session' };
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ProbeResult>((resolve) => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve({ kind: 'failed', status: null });
    }, timeoutMs);
  });
  const read = (async (): Promise<ProbeResult> => {
    try {
      const res = await fetchImpl(`${backend.origin}${PROBE_PATH}`, {
        method: 'POST',
        headers: {
          apikey: backend.anonKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Profile': 'itera',
        },
        body: '{}',
        cache: 'no-store',
        signal: controller?.signal,
      });
      // A redirect that left the backend: the answer is not the backend's.
      if (typeof res.url === 'string' && res.url !== '' && originOf(res.url) !== backend.origin) return { kind: 'failed', status: null };
      if (!res.ok) return { kind: 'failed', status: res.status };
      const text = await res.text();
      if (text.length > MAX_BODY_CHARS) return { kind: 'failed', status: res.status };
      const value: unknown = JSON.parse(text);
      if (value === null) return { kind: 'no-user' };
      return typeof value === 'string' && UUID.test(value) ? { kind: 'ok', iteraUserId: value } : { kind: 'failed', status: res.status };
    } catch {
      return { kind: 'failed', status: null };
    }
  })();
  try {
    return await Promise.race([read, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** The dev overlay line of a probe result. Never a token, a key or a response body. */
export function probeLine(result: ProbeResult | null): string {
  if (result === null) return 'Backend: —';
  switch (result.kind) {
    case 'ok':
      return `Backend: usuário ${result.iteraUserId}`;
    case 'no-user':
      return 'Backend: sessão sem usuário Itera';
    case 'no-session':
      return 'Backend: sem sessão';
    case 'not-configured':
      return 'Backend: não configurado (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY)';
    case 'failed':
      return `Backend: falhou${result.status === null ? '' : ` (${result.status})`}`;
  }
}
