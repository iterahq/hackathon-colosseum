import { describe, expect, it, vi } from 'vitest';
import { PROBE_PATH, parseBackend, probeIteraUser, probeLine, type ProbeFetch, type ProbeResponse } from './backendProbe';
import { PROJECT, fakeJwt } from './jwt.testkit';

const key = (role: string) => fakeJwt({ role, iss: 'supabase', ref: 'kjefmwlopzeaqgqtlbdn', sub: undefined, aud: undefined });
const ANON = key('anon');
const BACKEND = { origin: PROJECT, anonKey: ANON };
const ITERA_USER = '9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f';
const TOKEN = fakeJwt();
const answer = (body: string, init: Partial<ProbeResponse> = {}): ProbeResponse => ({ ok: true, status: 200, text: async () => body, ...init });

describe('parseBackend', () => {
  it('accepts a bare https origin and the anon key (a legacy JWT or a publishable key)', () => {
    expect(parseBackend(PROJECT, ANON)).toEqual(BACKEND);
    expect(parseBackend(`${PROJECT}/`, ` ${ANON} `)).toEqual(BACKEND);
    expect(parseBackend(PROJECT, 'sb_publishable_abc123')).toEqual({ origin: PROJECT, anonKey: 'sb_publishable_abc123' });
  });

  it.each([
    ['no url', undefined, ANON],
    ['no key', PROJECT, undefined],
    ['an empty key', PROJECT, '  '],
    ['plain http', 'http://kjefmwlopzeaqgqtlbdn.supabase.co', ANON],
    ['a path', `${PROJECT}/rest/v1`, ANON],
    ['a query', `${PROJECT}?apikey=x`, ANON],
    ['user info', 'https://user:pw@kjefmwlopzeaqgqtlbdn.supabase.co', ANON],
    ['not a URL', 'kjefmwlopzeaqgqtlbdn.supabase.co', ANON],
    ['a custom scheme', 'itera://kjefmwlopzeaqgqtlbdn.supabase.co', ANON],
    ['a service-role key', PROJECT, key('service_role')],
    ['a user token as key', PROJECT, key('authenticated')],
    ['a secret key', PROJECT, 'sb_secret_abc123'],
    ['an opaque key of unknown kind', PROJECT, 'abc123'],
    ['a key with a line break', PROJECT, `${ANON}\nX-Injected: 1`],
  ])('refuses %s', (_what, url, anonKey) => {
    expect(parseBackend(url, anonKey)).toBeNull();
  });
});

describe('probeIteraUser', () => {
  it('reads current_itera_user_id with the learner token: one POST to the backend origin, schema itera', async () => {
    const fetchImpl = vi.fn<ProbeFetch>(async () => answer(JSON.stringify(ITERA_USER)));
    expect(await probeIteraUser(BACKEND, async () => TOKEN, fetchImpl)).toEqual({ kind: 'ok', iteraUserId: ITERA_USER });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${PROJECT}${PROBE_PATH}`);
    expect(url).toBe('https://kjefmwlopzeaqgqtlbdn.supabase.co/rest/v1/rpc/current_itera_user_id');
    expect(init).toMatchObject({ method: 'POST', body: '{}', cache: 'no-store' });
    expect(init.headers).toEqual({ apikey: ANON, Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'Content-Profile': 'itera' });
  });

  it('with no session it does not touch the network', async () => {
    const fetchImpl = vi.fn<ProbeFetch>();
    expect(await probeIteraUser(BACKEND, async () => null, fetchImpl)).toEqual({ kind: 'no-session' });
    expect(await probeIteraUser(BACKEND, async () => Promise.reject(new Error('x')), fetchImpl)).toEqual({ kind: 'no-session' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('with no backend in the build it asks for no token and touches no network', async () => {
    const fetchImpl = vi.fn<ProbeFetch>();
    const getToken = vi.fn(async () => TOKEN);
    expect(await probeIteraUser(null, getToken, fetchImpl)).toEqual({ kind: 'not-configured' });
    expect(getToken).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['401', answer('{"message":"JWT expired"}', { ok: false, status: 401 }), { kind: 'failed', status: 401 }],
    ['a body that is not JSON', answer('<html>'), { kind: 'failed', status: null }],
    ['an id that is no uuid', answer('"admin"'), { kind: 'failed', status: 200 }],
    ['an object', answer('{"id":"x"}'), { kind: 'failed', status: 200 }],
    ['a long body', answer(JSON.stringify('x'.repeat(400))), { kind: 'failed', status: 200 }],
    ['an answer from another host (a redirect)', answer(JSON.stringify(ITERA_USER), { url: 'https://evil.example/rest/v1/rpc/current_itera_user_id' }), { kind: 'failed', status: null }],
    ['null: no itera.users row', answer('null'), { kind: 'no-user' }],
  ])('%s', async (_what, response, expected) => {
    expect(await probeIteraUser(BACKEND, async () => TOKEN, async () => response)).toEqual(expected);
  });

  it('a network error and a timeout are failures; nothing throws', async () => {
    expect(await probeIteraUser(BACKEND, async () => TOKEN, async () => Promise.reject(new Error(`boom ${TOKEN}`)))).toEqual({ kind: 'failed', status: null });
    let signal: AbortSignal | undefined;
    const never: ProbeFetch = (_url, init) => ((signal = init.signal), new Promise(() => undefined));
    expect(await probeIteraUser(BACKEND, async () => TOKEN, never, 10)).toEqual({ kind: 'failed', status: null });
    expect(signal?.aborted).toBe(true);
  });

  it('no result and no overlay line ever carries the token, the anon key or a response body', async () => {
    const results = [
      await probeIteraUser(BACKEND, async () => TOKEN, async () => answer(JSON.stringify(ITERA_USER))),
      await probeIteraUser(BACKEND, async () => TOKEN, async () => answer(`{"echo":"${TOKEN}"}`, { ok: false, status: 400 })),
      await probeIteraUser(BACKEND, async () => TOKEN, async () => answer(`"${TOKEN}"`)),
      await probeIteraUser(BACKEND, async () => TOKEN, async () => Promise.reject(new Error(TOKEN))),
    ];
    for (const result of results) {
      const text = `${JSON.stringify(result)} ${probeLine(result)}`;
      expect(text).not.toContain('eyJ');
      expect(text).not.toContain(ANON);
    }
  });
});

describe('probeLine', () => {
  it.each([
    [null, 'Backend: —'],
    [{ kind: 'ok', iteraUserId: ITERA_USER } as const, `Backend: usuário ${ITERA_USER}`],
    [{ kind: 'no-user' } as const, 'Backend: sessão sem usuário Itera'],
    [{ kind: 'no-session' } as const, 'Backend: sem sessão'],
    [{ kind: 'failed', status: 401 } as const, 'Backend: falhou (401)'],
    [{ kind: 'failed', status: null } as const, 'Backend: falhou'],
  ])('%j', (result, line) => {
    expect(probeLine(result)).toBe(line);
  });

  it('names the two public variables when the build has no backend', () => {
    expect(probeLine({ kind: 'not-configured' })).toContain('EXPO_PUBLIC_SUPABASE_URL');
  });
});
