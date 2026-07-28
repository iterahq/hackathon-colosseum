import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The guest data layer (plan 20260728-itera-guest-link-aula-sincrona).
 *
 * Two things worth locking down:
 *  1. the join APPLIES the minted session (`setSession`) — without that the guest
 *     holds a token nobody uses and the private Realtime channel refuses them;
 *  2. content comes from itera-api and is mapped by the SAME `mapActivity` the
 *     PostgREST path uses, so guest and member render identical activities.
 */

const mocks = vi.hoisted(() => ({
  setSession: vi.fn().mockResolvedValue({ error: null }),
  getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'guest-jwt' } } }),
  base: 'https://api.iterahq.dev',
}));

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({ auth: { setSession: mocks.setSession, getSession: mocks.getSession } }),
}));
vi.mock('@/api/iteraApi', () => ({ iteraApiBase: () => mocks.base }));

import {
  createGuestSession,
  getGuestLessonContent,
  guestJoinConfigured,
  readStoredGuestSession,
  storeGuestSession,
  clearStoredGuestSession,
  GuestJoinError,
} from '@/services/guestSession.service';

const okJson = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;
const failure = (status: number, text = '') =>
  ({ ok: false, status, text: async () => text }) as unknown as Response;

describe('createGuestSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setSession.mockResolvedValue({ error: null });
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('posts the code + name and APPLIES the returned Supabase session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 3600,
        itera_user_id: 'iu-1',
        session_id: 'sess-1',
        display_name: 'Ana',
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const guest = await createGuestSession({ code: 'ABCD2345', name: 'Ana', avatarUrl: '/a.png' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.iterahq.dev/v1/live/guest-session');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      code: 'ABCD2345',
      name: 'Ana',
      avatar_url: '/a.png',
    });
    expect(mocks.setSession).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' });
    expect(guest).toMatchObject({ code: 'ABCD2345', sessionId: 'sess-1', iteraUserId: 'iu-1' });
  });

  it('remembers the code→session mapping so a reload does not mint a SECOND guest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        okJson({ access_token: 'at', refresh_token: 'rt', session_id: 'sess-1', itera_user_id: 'iu-1' })
      )
    );
    await createGuestSession({ code: 'ABCD2345', name: 'Ana' });
    expect(readStoredGuestSession('ABCD2345')).toMatchObject({ sessionId: 'sess-1' });
    clearStoredGuestSession('ABCD2345');
    expect(readStoredGuestSession('ABCD2345')).toBeNull();
  });

  it('throws GuestJoinError on a dead code — never a silent half-join', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failure(404, 'no live session for code')));
    await expect(createGuestSession({ code: 'DEADCODE', name: 'Ana' })).rejects.toBeInstanceOf(
      GuestJoinError
    );
    expect(mocks.setSession).not.toHaveBeenCalled();
  });

  it('rejects a response missing the tokens instead of pretending it joined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({ session_id: 'sess-1' })));
    await expect(createGuestSession({ code: 'ABCD2345', name: 'Ana' })).rejects.toBeInstanceOf(
      GuestJoinError
    );
  });

  it('is dormant without itera-api configured', async () => {
    const prev = mocks.base;
    mocks.base = '';
    expect(guestJoinConfigured()).toBe(false);
    await expect(createGuestSession({ code: 'A', name: 'B' })).rejects.toBeInstanceOf(GuestJoinError);
    mocks.base = prev;
    expect(guestJoinConfigured()).toBe(true);
  });

  it('survives a localStorage that refuses to store (private mode)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() =>
      storeGuestSession({
        code: 'X',
        sessionId: 's',
        iteraUserId: 'u',
        displayName: 'n',
        avatarUrl: null,
      })
    ).not.toThrow();
    spy.mockRestore();
  });
});

describe('getGuestLessonContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'guest-jwt' } } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the guest JWT as a bearer and maps activities in ordinal order', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson({
        session: { id: 'sess-1', current_activity_id: 'act-2', status: 'live', podium_every: null },
        lesson: { id: 'les-1', title_i18n: { pt: 'Aula 1', en: 'Lesson 1' } },
        activities: [
          { id: 'act-2', lesson_id: 'les-1', ordinal: 2, kind: 'concept', spec: {}, rubric: null },
          { id: 'act-1', lesson_id: 'les-1', ordinal: 1, kind: 'quiz', spec: {}, rubric: null },
        ],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const content = await getGuestLessonContent('ABCD2345');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.iterahq.dev/v1/live/guest/ABCD2345/content');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer guest-jwt' });
    expect(content.id).toBe('les-1');
    expect(content.title.pt).toBe('Aula 1');
    expect(content.activities.map((a) => a.id)).toEqual(['act-1', 'act-2']);
    expect(content.activities[0].kind).toBe('quiz');
  });

  it('refuses to call the endpoint without a guest session', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(getGuestLessonContent('ABCD2345')).rejects.toThrow(/guest session missing/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on a non-OK response so the page shows its "unavailable" state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failure(403, 'not your session')));
    await expect(getGuestLessonContent('ABCD2345')).rejects.toThrow(/not your session/);
  });
});
