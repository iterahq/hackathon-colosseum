import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { PASSPORT_TIMEOUT_MS, TRAIL_HOLD_MS, usePassport } from '@/hooks/usePassport';
import type { PassportResult } from '@/types/achievements';

const env = vi.hoisted(() => ({
  session: { access_token: 'a.b.c', user: { id: 'u1' } } as { access_token: string; user: { id: string } } | null,
  guest: false,
  trails: [] as unknown[],
  trailsPending: false,
  call: vi.fn(),
}));

vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ session: env.session, signInWithSolana: vi.fn(async () => ({ error: null })) }) }));
vi.mock('@/services/guestSession.service', () => ({ isGuestAccessToken: () => env.guest }));
vi.mock('@/hooks/useTrailDashboard', () => ({ useTrailDashboard: () => ({ trails: env.trails, isPending: env.trailsPending }) }));
vi.mock('@/services/passport.service', () => ({
  PassportCallError: class extends Error {
    constructor(
      message: string,
      readonly status: number | null
    ) {
      super(message);
    }
  },
  callPassport: (...args: unknown[]) => env.call(...args),
}));

const day = (id: string, done: number) => ({ id, title: { pt: id }, total: 16, done, state: 'done' });
const TRAIL = { id: 't', title: { pt: 'Semana 1 · HTML' }, colorIndex: 1, days: [day('l1', 16), day('l2', 16), day('l3', 16), day('l4', 16), day('l5', 15)] };

const gold: PassportResult = {
  awards: [{ id: 's', key: 'day_stamp', kind: 'day', tier: null, title: 'd', ref_id: 'l5', state: { days_done: 5, total_days: 5, day: 5, parent_id: 'p' }, mint_status: 'pending', asset_address: null, tx_signature: null, explorer_url: null }],
  updated: [{ id: 'p', key: 'trail_pass', kind: 'trail', tier: 'gold', title: 't', ref_id: 'u', state: { days_done: 5, total_days: 5, tier: 'gold', trail_title: { pt: 'Semana 1 · HTML' } }, mint_status: 'minted', asset_address: 'A', tx_signature: 'S', explorer_url: null }],
  remaining: 0,
  mint: { wallet: 'W', cluster: 'devnet', attempted: 1, blocked: null },
  day_incomplete: null,
};

const mount = (over: Partial<Parameters<typeof usePassport>[0]> = {}) =>
  renderHook(() => usePassport({ lessonId: 'l5', fresh: true, done: 16, total: 16, ...over }), { wrapper: I18nProvider });
const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));

describe('usePassport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    env.session = { access_token: 'a.b.c', user: { id: 'u1' } };
    env.guest = false;
    env.trails = [TRAIL];
    env.trailsPending = false;
    env.call.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('a whole day: prepares on the first render, asks about THIS lesson, then shows what the server confirmed', async () => {
    let answer: (r: PassportResult) => void = () => undefined;
    env.call.mockReturnValue(new Promise<PassportResult>((resolve) => (answer = resolve)));
    const { result } = mount();
    expect(result.current.view).toEqual({ kind: 'preparing', preview: { day: 5, totalDays: 5, stampedBefore: 4, trailTitle: 'HTML', colorIndex: 1 } });
    expect(env.call).toHaveBeenCalledWith('pt', 'l5');
    await act(async () => answer(gold));
    expect(result.current.view).toMatchObject({ kind: 'ceremony', model: { last: true, status: 'minted', daysDone: 5, trailTitle: 'HTML' } });
  });

  it('15/16: says one is missing and never calls the function', async () => {
    const { result } = mount({ done: 15 });
    await flush();
    expect(result.current.view).toEqual({ kind: 'incomplete', missing: 1, done: 15, total: 16 });
    expect(env.call).not.toHaveBeenCalled();
  });

  it('the server finds the day unfinished: its count, no ceremony', async () => {
    env.call.mockResolvedValue({ ...gold, day_incomplete: { lesson_id: 'l5', done: 15, total: 16 } });
    const { result } = mount();
    await flush();
    expect(result.current.view).toEqual({ kind: 'incomplete', missing: 1, done: 15, total: 16 });
  });

  it('an error or a 20 s silence falls back to the card with the honest line', async () => {
    env.call.mockRejectedValue(new Error('boom'));
    const failed = mount();
    await flush();
    expect(failed.result.current.view).toEqual({ kind: 'card', note: 'stampLater' });
    failed.unmount();

    env.call.mockReturnValue(new Promise(() => undefined));
    const slow = mount();
    await act(async () => void (await vi.advanceTimersByTimeAsync(PASSPORT_TIMEOUT_MS - 1)));
    expect(slow.result.current.view.kind).toBe('preparing');
    await act(async () => void (await vi.advanceTimersByTimeAsync(2)));
    expect(slow.result.current.view).toEqual({ kind: 'card', note: 'stampLater' });
  });

  it('a lesson outside any trail: the card, with the call still made quietly', async () => {
    env.trails = [];
    env.call.mockResolvedValue({ awards: [], updated: [], remaining: 0 });
    const { result } = mount();
    expect(result.current.view).toEqual({ kind: 'card', note: null });
    await flush();
    expect(result.current.view).toEqual({ kind: 'card', note: null });
    expect(env.call).toHaveBeenCalledTimes(1);
  });

  it('trails not read yet: holds, and gives up on them after a moment', async () => {
    env.trails = [];
    env.trailsPending = true;
    env.call.mockReturnValue(new Promise(() => undefined));
    const { result } = mount();
    expect(result.current.view).toEqual({ kind: 'hold' });
    await act(async () => void (await vi.advanceTimersByTimeAsync(TRAIL_HOLD_MS + 1)));
    expect(result.current.view).toEqual({ kind: 'card', note: null });
  });

  it('a guest and a signed-out visitor get the plain card', async () => {
    env.guest = true;
    env.call.mockResolvedValue(gold);
    const guest = mount();
    await flush();
    expect(guest.result.current.view).toEqual({ kind: 'card', note: null });
    guest.unmount();
    env.session = null;
    env.call.mockClear();
    const anon = mount();
    await flush();
    expect(anon.result.current.view).toEqual({ kind: 'card', note: null });
    expect(env.call).not.toHaveBeenCalled();
  });

  it('a retry that brings nothing new keeps the confirmed ceremony, as failed', async () => {
    const unminted = { ...gold, updated: [{ ...gold.updated[0], mint_status: 'failed' as const }], remaining: 1 };
    env.call.mockResolvedValueOnce(unminted).mockResolvedValueOnce({ ...unminted, remaining: 0, mint: { ...gold.mint!, attempted: 1 } });
    const { result } = mount();
    await flush();
    expect(result.current.view).toMatchObject({ kind: 'ceremony', model: { status: 'failed', last: true } });
    env.call.mockReset();
    env.call.mockResolvedValue({ awards: [], updated: [], remaining: 0 });
    act(() => result.current.retry());
    expect(result.current.view).toMatchObject({ kind: 'ceremony', model: { status: 'minting', last: true } });
    await flush();
    expect(result.current.view).toMatchObject({ kind: 'ceremony', model: { status: 'failed', last: true } });
  });

  it('"Depois" closes it', async () => {
    env.call.mockResolvedValue(gold);
    const { result } = mount();
    await flush();
    act(() => result.current.dismiss());
    expect(result.current.view).toEqual({ kind: 'card', note: null });
  });
});
