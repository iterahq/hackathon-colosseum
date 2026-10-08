import { describe, expect, it, vi } from 'vitest';
import type { ProbeFetch, ProbeResponse } from './backendProbe';
import { createNativeBackend, nativeBackend, provideBackend, type TokenSource } from './nativeBackend';
import { PROJECT, fakeJwt } from './jwt.testkit';

const ANON = fakeJwt({ role: 'anon', iss: 'supabase', ref: 'kjefmwlopzeaqgqtlbdn', sub: undefined, aud: undefined });
const BACKEND = { origin: PROJECT, anonKey: ANON };
const TOKEN = fakeJwt();
const answer = (body: string, init: Partial<ProbeResponse> = {}): ProbeResponse => ({ ok: true, status: 200, text: async () => body, ...init });

function source(token: string | null = TOKEN) {
  const listeners = new Set<(event: { type: string }) => void>();
  const session: TokenSource = {
    getAccessToken: vi.fn(async () => token),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { session, emit: (type: string) => listeners.forEach((l) => l({ type })), listeners };
}

describe('createNativeBackend', () => {
  it('an RPC is one POST to the backend, schema itera, as the learner', async () => {
    const fetchImpl = vi.fn<ProbeFetch>(async () => answer('[{"id":"p1"}]'));
    const backend = createNativeBackend(BACKEND, source().session, fetchImpl);
    expect(await backend.rpc('enroll_in_program', { p_program_id: 'p1' })).toEqual({ kind: 'ok', value: [{ id: 'p1' }], status: 200 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${PROJECT}/rest/v1/rpc/enroll_in_program`);
    expect(init).toMatchObject({ method: 'POST', body: '{"p_program_id":"p1"}', cache: 'no-store' });
    expect(init.headers).toEqual({ apikey: ANON, Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'Content-Profile': 'itera' });
  });

  it('rows are one GET with the read profile and no body', async () => {
    const fetchImpl = vi.fn<ProbeFetch>(async () => answer('[]'));
    const backend = createNativeBackend(BACKEND, source().session, fetchImpl);
    expect(await backend.rows('my_subscription', 'select=is_active')).toEqual({ kind: 'ok', value: [], status: 200 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${PROJECT}/rest/v1/my_subscription?select=is_active`);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ apikey: ANON, Authorization: `Bearer ${TOKEN}`, 'Accept-Profile': 'itera' });
  });

  it('with no session, no token or no backend in the build it touches no network', async () => {
    const fetchImpl = vi.fn<ProbeFetch>();
    expect(await createNativeBackend(BACKEND, null, fetchImpl).rpc('catalog_programs')).toEqual({ kind: 'not-configured' });
    expect(await createNativeBackend(null, source().session, fetchImpl).rpc('catalog_programs')).toEqual({ kind: 'not-configured' });
    expect(await createNativeBackend(BACKEND, source(null).session, fetchImpl).rpc('catalog_programs')).toEqual({ kind: 'no-session' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a token the page did not give in time is a failed read while the page calls the learner signed in, and no session once it said signed out', async () => {
    const { session, emit } = source(null);
    const fetchImpl = vi.fn<ProbeFetch>();
    const backend = createNativeBackend(BACKEND, session, fetchImpl);
    expect(await backend.rpc('catalog_programs')).toEqual({ kind: 'no-session' });
    emit('signed-in');
    expect(await backend.rpc('catalog_programs')).toEqual({ kind: 'failed', status: null });
    expect(await backend.rows('my_subscription', 'select=is_active')).toEqual({ kind: 'failed', status: null });
    emit('token-refreshed');
    expect(await backend.rpc('catalog_programs')).toEqual({ kind: 'failed', status: null });
    emit('signed-out');
    expect(await backend.rpc('catalog_programs')).toEqual({ kind: 'no-session' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a name that is not a plain identifier never reaches the network: the path cannot be steered', async () => {
    const fetchImpl = vi.fn<ProbeFetch>();
    const backend = createNativeBackend(BACKEND, source().session, fetchImpl);
    for (const name of ['../auth/v1/user', 'a/b', 'a?b', '', 'A']) {
      expect(await backend.rpc(name)).toEqual({ kind: 'failed', status: null });
      expect(await backend.rows(name, 'select=*')).toEqual({ kind: 'failed', status: null });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('an error status and an unreachable backend are told apart; neither carries the token', async () => {
    const backend = (fetchImpl: ProbeFetch) => createNativeBackend(BACKEND, source().session, fetchImpl);
    expect(await backend(async () => answer('{"message":"x"}', { ok: false, status: 500 })).rpc('catalog_programs')).toEqual({ kind: 'failed', status: 500 });
    const offline = await backend(async () => Promise.reject(new Error(`boom ${TOKEN}`))).rpc('catalog_programs');
    expect(offline).toEqual({ kind: 'failed', status: null });
    expect(JSON.stringify(offline)).not.toContain(TOKEN);
  });

  it('email is the claim of the token, and null with no session, no claim or a token that cannot be read', async () => {
    expect(await createNativeBackend(BACKEND, source().session).email()).toBe('aluna@example.com');
    expect(await createNativeBackend(BACKEND, source(fakeJwt({ email: undefined })).session).email()).toBeNull();
    expect(await createNativeBackend(BACKEND, source('not-a-token').session).email()).toBeNull();
    expect(await createNativeBackend(BACKEND, source(null).session).email()).toBeNull();
    expect(await createNativeBackend(BACKEND, null).email()).toBeNull();
  });

  it('onSession tells a new learner and a sign-out, not a refreshed token', () => {
    const { session, emit, listeners } = source();
    const seen: boolean[] = [];
    const off = createNativeBackend(BACKEND, session).onSession((signedIn) => seen.push(signedIn));
    emit('signed-in');
    emit('token-refreshed');
    emit('signed-out');
    expect(seen).toEqual([true, false]);
    off();
    // The one listener left is the backend's own: it follows what the page said last, for the life of the process.
    expect(listeners.size).toBe(1);
    emit('signed-out');
    expect(seen).toEqual([true, false]);
  });
});

describe('nativeBackend', () => {
  it('has no session until the route file provides one, and reaches it afterwards', async () => {
    expect(await nativeBackend.rpc('catalog_programs')).toEqual({ kind: 'not-configured' });
    provideBackend(BACKEND, source(null).session);
    expect(await nativeBackend.rpc('catalog_programs')).toEqual({ kind: 'no-session' });
    provideBackend(null, null);
  });
});
