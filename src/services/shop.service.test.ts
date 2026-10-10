import { beforeEach, describe, expect, it, vi } from 'vitest';

const callShop = vi.fn();
vi.mock('@/services/shopTransport', async (orig) => ({ ...(await orig<typeof import('@/services/shopTransport')>()), callShop: (...a: unknown[]) => callShop(...a) }));

import { ShopCallError } from '@/services/shopTransport';
import { submitPurchase } from './shop.service';

beforeEach(() => vi.clearAllMocks());

describe('submitPurchase', () => {
  it('posts the signed transaction and reads the confirmation', async () => {
    callShop.mockResolvedValue({ data: { status: 'paid', item: { key: 'life_refill' } } });
    const result = await submitPurchase('i1', 'B64', 'pt');
    expect(callShop).toHaveBeenCalledWith('purchase-submit', { body: { intent_id: 'i1', signed_transaction: 'B64', lang: 'pt' } });
    expect(result.status).toBe('paid');
  });

  it('turns a retryable answer into pending', async () => {
    callShop.mockRejectedValue(new ShopCallError('x', 503, 'rpc_unavailable', true));
    expect((await submitPurchase('i1', 'B64', 'pt')).status).toBe('pending');
  });

  it('keeps the signature of a failure after broadcast', async () => {
    callShop.mockRejectedValue(new ShopCallError('x', 422, 'tx_failed', false, null, 'SIG'));
    await expect(submitPurchase('i1', 'B64', 'pt')).rejects.toMatchObject({ signature: 'SIG' });
  });
});
