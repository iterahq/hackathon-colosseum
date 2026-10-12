import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toChest } from '@/services/teraChest.service';
import { WIRE_CHEST_COMMITTED, WIRE_CHEST_MINTED } from '@/services/teraChestMock';
import { useDayChest } from './useDayChest';

const api = vi.hoisted(() => ({ list: vi.fn(), settle: vi.fn() }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ session: { access_token: 'token', user: { id: 'u1' } } }) }));
vi.mock('@/services/guestSession.service', () => ({ isGuestAccessToken: () => false }));
vi.mock('@/services/teraChest.service', async (actual) => ({ ...(await actual<typeof import('@/services/teraChest.service')>()), getMyChests: () => api.list(), settleChest: (id: string) => api.settle(id) }));

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
const chest = (wire: Record<string, unknown>, lesson: string) => toChest({ ...wire, lesson_id: lesson })!;

describe('useDayChest', () => {
  beforeEach(() => {
    api.list.mockReset();
    api.settle.mockReset();
  });

  it('a day stamped now asks for its chest at once', async () => {
    api.list.mockResolvedValue({ enabled: true, chests: [] });
    api.settle.mockResolvedValue(chest(WIRE_CHEST_MINTED, 'l1'));
    const { result } = renderHook(() => useDayChest('l1', true, 'stamped'), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe('revealed'));
    expect(api.settle).toHaveBeenCalledWith('l1');
  });

  it('an old day with no chest is NEVER asked for by looking: it is offered, and opened by the click', async () => {
    api.list.mockResolvedValue({ enabled: true, chests: [chest(WIRE_CHEST_MINTED, 'another-lesson')] });
    api.settle.mockResolvedValue(chest(WIRE_CHEST_MINTED, 'l1'));
    const { result } = renderHook(() => useDayChest('l1', true, 'found'), { wrapper });
    await waitFor(() => expect(result.current.canOpen).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(api.settle).not.toHaveBeenCalled();
    expect(result.current.phase).toBeNull();
    act(() => result.current.open());
    await waitFor(() => expect(result.current.phase).toBe('revealed'));
    expect(api.settle).toHaveBeenCalledTimes(1);
    expect(result.current.justOpened).toBe(true);
  });

  it('a day found again shows the chest it already has, from the list, without asking', async () => {
    api.list.mockResolvedValue({ enabled: true, chests: [chest(WIRE_CHEST_MINTED, 'l1')] });
    const { result } = renderHook(() => useDayChest('l1', true, 'found'), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe('revealed'));
    expect(result.current.canOpen).toBe(false);
    expect(api.settle).not.toHaveBeenCalled();
  });

  it('a chest the stamp already sealed and that is still opening is followed', async () => {
    api.list.mockResolvedValue({ enabled: true, chests: [chest(WIRE_CHEST_COMMITTED, 'l1')] });
    api.settle.mockResolvedValue(chest(WIRE_CHEST_MINTED, 'l1'));
    const { result } = renderHook(() => useDayChest('l1', true, 'found'), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe('revealed'));
    expect(api.settle).toHaveBeenCalledWith('l1');
  });

  it('the click on a day that has nothing to give says so', async () => {
    api.list.mockResolvedValue({ enabled: true, chests: [] });
    api.settle.mockResolvedValue(null);
    const { result } = renderHook(() => useDayChest('l1', true, 'found'), { wrapper });
    await waitFor(() => expect(result.current.canOpen).toBe(true));
    act(() => result.current.open());
    await waitFor(() => expect(result.current.nothing).toBe(true));
  });

  it('with the feature off, or a day whose stamp is still owed, nothing is asked or offered', async () => {
    api.list.mockResolvedValue({ enabled: false, chests: [] });
    const off = renderHook(() => useDayChest('l1', true, 'found'), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect([off.result.current.phase, off.result.current.canOpen]).toEqual([null, false]);
    api.list.mockResolvedValue({ enabled: true, chests: [] });
    const owed = renderHook(() => useDayChest('l1', false, 'found'), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect([owed.result.current.phase, owed.result.current.canOpen]).toEqual([null, false]);
    expect(api.settle).not.toHaveBeenCalled();
  });
});
