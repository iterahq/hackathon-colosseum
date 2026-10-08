/**
 * The shell's one reader of the backend (`readBackend`): a read of PostgREST as the signed-in learner, with
 * the access token the page handed over (`nativeSession.ts`). Two callers: the native hosts of the
 * universal screens, through `nativeBackend.ts`, and the development probe of PLAN row R-12, which calls
 * the RPC `current_itera_user_id` of schema `itera` (the same call the web makes in
 * `src/services/iteraUser.ts`); `app/[...path].tsx` runs the probe under `__DEV__` only and shows the
 * result in the dev overlay.
 *
 * This file and `shellGate.ts` are the only ones in the shell that may contain a network call
 * (one-copy rule 1b), and this one holds exactly one. It talks to ONE host: the https origin of `EXPO_PUBLIC_SUPABASE_URL`, with a path
 * that is a constant. Both `EXPO_PUBLIC_*` values are public by definition: Metro inlines them into the
 * bundle, exactly as Vite inlines the web's `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The anon
 * key grants nothing without row-level security; a service-role key is refused here (`parseBackend`).
 *
 * Nothing that leaves this file carries the token, the anon key or a response body.
 *
 * Pure TypeScript: no React Native import.
 */
import { originOf } from './origin';
import { UUID, jwtPayload } from './tokenPayload';

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

/** The `role` claim of a legacy JWT key, or null for an opaque key (`sb_publishable_...`). */
function roleOfKey(key: string): string | null {
  const role = jwtPayload(key)?.role;
  return typeof role === 'string' ? role : null;
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
  init: { method: 'POST' | 'GET' | 'PATCH'; headers: Record<string, string>; body?: string; cache: 'no-store'; signal?: AbortSignal },
) => Promise<ProbeResponse>;

/**
 * One call of PostgREST, schema `itera`: `path` continues `/rest/v1/`; a `body` makes it a POST (an RPC), none a
 * GET (rows). `patch` with a `body` is a PATCH of the rows the path selects, answered with the rows it changed
 * (`Prefer: return=representation`). This function sends what it is given: which table, row and columns a
 * write may name is decided by its one caller, `nativeBackend.update`.
 */
export interface BackendRequest {
  path: string;
  body?: string;
  patch?: boolean;
  /** An answer longer than this is refused: it is not parsed and nothing of it is returned. The body is in memory by then (React Native's `fetch` has no stream to stop), so what bounds the download is the timeout, not this. Counted in UTF-16 units. */
  maxChars: number;
}

export type BackendAnswer =
  | { kind: 'ok'; value: unknown; status: number }
  | { kind: 'no-session' }
  | { kind: 'not-configured' }
  /** `status` null: no answer from the backend (offline, a timeout, an answer that is not JSON or came from another origin). */
  | { kind: 'failed'; status: number | null };

export const REST_PATH = '/rest/v1/';

/**
 * The one network call of the shell's native screens and of the probe: a read of the backend as the
 * signed-in learner. `getAccessToken` is the native session's: it gives a token with life left, asks the
 * page for a fresh one otherwise, and null when there is none. Never throws, never waits longer than
 * `timeoutMs` (the wait for the token included), and nothing it returns carries the token or the key.
 */
export async function readBackend(
  backend: Backend | null,
  getAccessToken: () => Promise<string | null>,
  request: BackendRequest,
  fetchImpl: ProbeFetch = (url, init) => fetch(url, init),
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<BackendAnswer> {
  if (backend === null) return { kind: 'not-configured' };
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The clock starts before the token is asked for: the wait for the page's answer counts too.
  const timeout = new Promise<BackendAnswer>((resolve) => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve({ kind: 'failed', status: null });
    }, timeoutMs);
  });
  const read = (async (): Promise<BackendAnswer> => {
    let token: string | null;
    try {
      token = await getAccessToken();
    } catch {
      token = null;
    }
    if (token === null) return { kind: 'no-session' };
    if (controller?.signal.aborted) return { kind: 'failed', status: null };
    const auth = { apikey: backend.anonKey, Authorization: `Bearer ${token}` };
    try {
      const res = await fetchImpl(`${backend.origin}${REST_PATH}${request.path}`, {
        ...(request.body === undefined
          ? { method: 'GET', headers: { ...auth, 'Accept-Profile': 'itera' } }
          : { method: request.patch ? 'PATCH' : 'POST', headers: { ...auth, 'Content-Type': 'application/json', 'Content-Profile': 'itera', ...(request.patch ? { Prefer: 'return=representation' } : {}) }, body: request.body }),
        cache: 'no-store',
        signal: controller?.signal,
      });
      // A redirect that left the backend: the answer is not the backend's.
      if (typeof res.url === 'string' && res.url !== '' && originOf(res.url) !== backend.origin) return { kind: 'failed', status: null };
      if (!res.ok) return { kind: 'failed', status: res.status };
      const text = await res.text();
      if (text.length > request.maxChars) return { kind: 'failed', status: res.status };
      return { kind: 'ok', value: JSON.parse(text) as unknown, status: res.status };
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

/** Ask the backend who the token is. Never throws, never waits longer than `timeoutMs`. */
export async function probeIteraUser(
  backend: Backend | null,
  getAccessToken: () => Promise<string | null>,
  fetchImpl?: ProbeFetch,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<ProbeResult> {
  const answer = await readBackend(backend, getAccessToken, { path: PROBE_PATH.slice(REST_PATH.length), body: '{}', maxChars: MAX_BODY_CHARS }, fetchImpl, timeoutMs);
  if (answer.kind !== 'ok') return answer;
  if (answer.value === null) return { kind: 'no-user' };
  return typeof answer.value === 'string' && UUID.test(answer.value) ? { kind: 'ok', iteraUserId: answer.value } : { kind: 'failed', status: answer.status };
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
