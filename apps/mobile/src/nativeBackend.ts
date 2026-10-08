/**
 * The backend as the native hosts of the universal screens read it: PostgREST of schema `itera`, as the
 * signed-in learner, through the one reader of the shell (`readBackend`, `backendProbe.ts`). The token is
 * the copy the page handed over (`nativeSession.ts`, ADR-10): asked for on every read, never kept here,
 * never refreshed here. The route file that owns the process-wide session (`app/[...path].tsx`) provides
 * it once, at module load; before that, and in a build that names no backend, every read is `no-session`.
 *
 * `no-session` means the page said so, or has said nothing yet (a native path opened with no WebView beneath).
 * A learner the page called signed in, whose token could not be had in time, gets a failed read instead.
 * One case still reads as a sign-out: `nativeSession.revalidate` drops the copy when no page vouches for it
 * within its grace after a return to the foreground, and it does so by the same event.
 *
 * Pure TypeScript: no React Native import.
 */
import { readBackend, type Backend, type BackendAnswer, type ProbeFetch } from './backendProbe';

/** The part of the bridge's `ShellSession` a reader needs. */
export interface TokenSource {
  getAccessToken(): Promise<string | null>;
  subscribe(listener: (event: { readonly type: string }) => void): () => void;
}

export interface NativeBackend {
  /** Call an RPC of schema `itera`. */
  rpc(name: string, args?: Readonly<Record<string, unknown>>): Promise<BackendAnswer>;
  /** Read rows: `resource` is a table or view, `query` its PostgREST query string. */
  rows(resource: string, query: string): Promise<BackendAnswer>;
  /** Tells when another learner signed in (true) or the session ended (false). A refreshed token tells nothing. */
  onSession(listener: (signedIn: boolean) => void): () => void;
}

/** A catalog of every course with its titles stays far below this. */
export const MAX_ANSWER_CHARS = 512 * 1024;
const NAME = /^[a-z][a-z0-9_]*$/;
const REFUSED: BackendAnswer = { kind: 'failed', status: null };
/** The page says the learner is signed in, but gave no token in time: a failed read (the screen offers a retry), not a sign-out. */
const LATE_TOKEN: BackendAnswer = { kind: 'failed', status: null };

export function createNativeBackend(backend: Backend | null, session: TokenSource | null, fetchImpl?: ProbeFetch): NativeBackend {
  const token = () => (session === null ? Promise.resolve(null) : session.getAccessToken());
  // What the page said last. `getAccessToken` answers null both when the learner signed out and when the page did not hand a
  // fresh token over in time (a suspended WebView, a copy past its life): only the first is "no session".
  let signedIn = false;
  session?.subscribe((event) => {
    if (event.type === 'signed-in' || event.type === 'token-refreshed') signedIn = true;
    else if (event.type === 'signed-out') signedIn = false;
  });
  const read = async (path: string, body?: string): Promise<BackendAnswer> => {
    const answer = await readBackend(session === null ? null : backend, token, { path, body, maxChars: MAX_ANSWER_CHARS }, fetchImpl);
    return answer.kind === 'no-session' && signedIn ? LATE_TOKEN : answer;
  };
  return {
    rpc: (name, args = {}) => (NAME.test(name) ? read(`rpc/${name}`, JSON.stringify(args)) : Promise.resolve(REFUSED)),
    rows: (resource, query) => (NAME.test(resource) ? read(`${resource}?${query}`) : Promise.resolve(REFUSED)),
    onSession(listener) {
      if (session === null) return () => {};
      return session.subscribe((event) => {
        if (event.type === 'signed-in') listener(true);
        else if (event.type === 'signed-out') listener(false);
      });
    },
  };
}

let provided = createNativeBackend(null, null);

/** Called once by the route file that creates the process-wide session. */
export function provideBackend(backend: Backend | null, session: TokenSource | null): void {
  provided = createNativeBackend(backend, session);
}

/** The backend of this process. Read at call time: a host created before `provideBackend` still reaches it. */
export const nativeBackend: NativeBackend = {
  rpc: (name, args) => provided.rpc(name, args),
  rows: (resource, query) => provided.rows(resource, query),
  onSession: (listener) => provided.onSession(listener),
};
