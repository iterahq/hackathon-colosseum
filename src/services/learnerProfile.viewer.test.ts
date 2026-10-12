import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ token: null as string | null }));
vi.mock('@/services/guestSession.service', () => ({ isGuestAccessToken: (token: string) => token.startsWith('guest') }));
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: session.token ? { access_token: session.token } : null } }) } }),
}));

const STUB = { wallet: 'W1', cluster: 'devnet', private: true };
const FULL = { wallet: 'W1', private: true, viewer: 'owner', verified_count: 1, certifications: [{ asset: 'A1', trail: 'HTML', days_done: 1, total_days: 5 }], medals: [], avatars: [] };
const answer = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

async function load() {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
  return import('@/services/learnerProfile.service');
}

describe('reading a wallet as its owner or as a stranger', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    session.token = null;
    delete (window as unknown as Record<string, unknown>).__iteraProfile;
    delete (window as unknown as Record<string, unknown>).__iteraGraph;
  });
  afterEach(() => vi.unstubAllEnvs());

  it('tells the stub of a private wallet from a profile', async () => {
    const { isPrivateStub } = await load();
    expect(isPrivateStub(STUB)).toBe(true);
    expect(isPrivateStub(FULL)).toBe(false);
    expect(isPrivateStub({ wallet: 'W1', private: false, certifications: [] })).toBe(false);
    expect(isPrivateStub({ wallet: 'W1', certifications: [] })).toBe(false);
  });

  it('a stranger gets "private" and nothing else, with the anon key', async () => {
    const { getLearnerProfile } = await load();
    fetchMock.mockResolvedValue(answer(STUB));
    expect(await getLearnerProfile('W1', 'pt')).toEqual({ status: 'private', wallet: 'W1' });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer anon');
  });

  it('the signed-in learner sends their own session, so the owner of a private profile reads it whole', async () => {
    const { getLearnerProfile } = await load();
    session.token = 'owner-jwt';
    fetchMock.mockResolvedValue(answer(FULL));
    const lookup = await getLearnerProfile('W1', 'pt');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer owner-jwt');
    expect(lookup.status).toBe('ok');
    expect(lookup.status === 'ok' && [lookup.profile.private, lookup.profile.viewer, lookup.profile.certifications.length]).toEqual([true, 'owner', 1]);
  });

  it('a read the page started as a stranger is asked again once a session exists', async () => {
    const { getLearnerProfile } = await load();
    session.token = 'owner-jwt';
    (window as unknown as Record<string, unknown>).__iteraProfile = { wallet: 'W1', lang: 'pt', response: Promise.resolve(answer(STUB)) };
    fetchMock.mockResolvedValue(answer(FULL));
    const lookup = await getLearnerProfile('W1', 'pt');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer owner-jwt');
    expect(lookup.status).toBe('ok');
  });

  it('a guest session reads as a stranger, and a session the function refuses falls back to the anon key', async () => {
    const { getLearnerProfile } = await load();
    session.token = 'guest-token';
    fetchMock.mockResolvedValue(answer(STUB));
    await getLearnerProfile('W1', 'pt');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer anon');
    session.token = 'stale-jwt';
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) }).mockResolvedValueOnce(answer({ wallet: 'W1', private: false, viewer: 'public', certifications: [], medals: [] }));
    const lookup = await getLearnerProfile('W1', 'pt');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer anon');
    expect(lookup.status).toBe('ok');
  });

  it('a signed-in learner looking at SOMEONE ELSE who is private still gets "private"', async () => {
    const { getLearnerProfile } = await load();
    session.token = 'other-jwt';
    fetchMock.mockResolvedValue(answer(STUB));
    expect(await getLearnerProfile('W1', 'pt')).toEqual({ status: 'private', wallet: 'W1' });
  });

  it('the graph of a private wallet is nothing for a stranger, and the owner sends the session', async () => {
    const { getWalletGraph } = await load();
    fetchMock.mockResolvedValue(answer({ wallet: 'W1', private: true }));
    expect(await getWalletGraph('W1', 'pt')).toBeNull();
    expect(fetchMock.mock.calls[0][1]).toBeUndefined();
    session.token = 'owner-jwt';
    await getWalletGraph('W1', 'pt');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer owner-jwt');
  });
});
