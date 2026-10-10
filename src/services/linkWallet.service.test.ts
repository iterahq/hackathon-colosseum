import { beforeEach, describe, expect, it, vi } from 'vitest';

const callShop = vi.fn();
const callPassport = vi.fn();
vi.mock('@/services/shopTransport', () => ({ callShop: (...a: unknown[]) => callShop(...a) }));
vi.mock('@/services/passport.service', () => ({ callPassport: (...a: unknown[]) => callPassport(...a) }));

import { getLinkStatus, mintPendingRows, requestChallenge, verifyChallenge } from './linkWallet.service';

beforeEach(() => vi.clearAllMocks());

describe('link-wallet calls', () => {
  it('reads the status', async () => {
    callShop.mockResolvedValue({ data: { wallet: 'W', source: 'linked' } });
    await expect(getLinkStatus()).resolves.toEqual({ wallet: 'W', source: 'linked' });
    callShop.mockResolvedValue({ data: { wallet: null, source: null } });
    await expect(getLinkStatus()).resolves.toEqual({ wallet: null, source: null });
  });

  it('asks for a challenge and verifies it', async () => {
    callShop.mockResolvedValueOnce({ data: { challenge_id: 'c1', message: 'sign me', expires_at: 'x' } });
    await expect(requestChallenge('ADDR')).resolves.toEqual({ challengeId: 'c1', message: 'sign me' });
    expect(callShop).toHaveBeenLastCalledWith('link-wallet', { body: { action: 'challenge', address: 'ADDR' } });
    callShop.mockResolvedValueOnce({ data: { wallet: 'ADDR', linked_at: 'x', pending_mints: 3 } });
    await expect(verifyChallenge('c1', 'SIG')).resolves.toEqual({ wallet: 'ADDR', pendingMints: 3 });
    expect(callShop).toHaveBeenLastCalledWith('link-wallet', { body: { action: 'verify', challenge_id: 'c1', signature: 'SIG' } });
  });
});

describe('mintPendingRows', () => {
  it('calls passport sequentially until nothing remains', async () => {
    callPassport.mockResolvedValueOnce({ remaining: 2 }).mockResolvedValueOnce({ remaining: 1 }).mockResolvedValueOnce({ remaining: 0 });
    const seen: number[] = [];
    await expect(mintPendingRows('pt', (n) => seen.push(n), 3)).resolves.toBe(0);
    expect(callPassport).toHaveBeenCalledTimes(3);
    expect(seen).toEqual([2, 1, 0]);
  });

  it('does not call passport when nothing is pending', async () => {
    await expect(mintPendingRows('pt', () => {}, 0)).resolves.toBe(0);
    expect(callPassport).not.toHaveBeenCalled();
  });

  it('stops quietly when a pass fails', async () => {
    callPassport.mockResolvedValueOnce({ remaining: 2 }).mockRejectedValueOnce(new Error('boom'));
    await expect(mintPendingRows('pt', () => {}, 3)).resolves.toBe(2);
  });

  it('gives up when the backend stops making progress', async () => {
    callPassport.mockResolvedValue({ remaining: 5 });
    await expect(mintPendingRows('pt', () => {}, 5)).resolves.toBe(5);
    expect(callPassport.mock.calls.length).toBeLessThan(10);
  });
});
