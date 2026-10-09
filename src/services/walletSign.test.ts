import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PurchaseIntent } from '@/types/shop';
import { WalletSignError, classifyWalletError, signAndSendPurchase } from './walletSign';

const intent: PurchaseIntent = {
  intentId: 'i1',
  messageBase58: 'MSG58',
  transactionBase58: 'TX58',
  transactionBase64: 'AQID',
  priceLamports: 500_000,
  priceUsdCents: 10,
  priceLabel: 'US$ 0.10',
  expiresAt: null,
  cluster: 'devnet',
};

const install = (provider: Record<string, unknown>) => {
  (window as unknown as { solana?: unknown }).solana = { connect: vi.fn(), ...provider };
};

afterEach(() => {
  delete (window as unknown as { solana?: unknown }).solana;
  vi.restoreAllMocks();
});

describe('classifyWalletError', () => {
  it('treats a user rejection as cancelled', () => {
    expect(classifyWalletError({ code: 4001, message: 'User rejected the request.' }).reason).toBe('cancelled');
  });

  it('spots an empty wallet', () => {
    expect(classifyWalletError(new Error('Transaction simulation failed: Attempt to debit an account but found no record of a prior credit.')).reason).toBe('insufficient');
    expect(classifyWalletError({ code: -32603, message: 'insufficient lamports 0, need 500000' }).reason).toBe('insufficient');
  });

  it('keeps code and message of anything else', () => {
    const failure = classifyWalletError({ code: -32603, message: 'Something went wrong' });
    expect(failure.reason).toBe('failed');
    expect(failure.detail).toBe('-32603: Something went wrong');
  });
});

describe('signAndSendPurchase', () => {
  it('sends the transaction MESSAGE through the request form', async () => {
    const request = vi.fn().mockResolvedValue({ signature: 'SIG' });
    install({ request });
    await expect(signAndSendPurchase(intent)).resolves.toBe('SIG');
    expect(request).toHaveBeenCalledWith({ method: 'signAndSendTransaction', params: { message: 'MSG58' } });
  });

  it('fails with no_wallet when nothing is injected', async () => {
    await expect(signAndSendPurchase(intent)).rejects.toMatchObject({ reason: 'no_wallet' });
  });

  it('never takes the fallback after a rejection', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const signAndSendTransaction = vi.fn();
    install({ request: vi.fn().mockRejectedValue({ code: 4001, message: 'User rejected the request.' }), signAndSendTransaction });
    await expect(signAndSendPurchase(intent)).rejects.toBeInstanceOf(WalletSignError);
    expect(signAndSendTransaction).not.toHaveBeenCalled();
  });

  it('tries the object form only when the wallet does not support the request form', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const signAndSendTransaction = vi.fn().mockResolvedValue({ signature: 'SIG2' });
    install({ request: vi.fn().mockRejectedValue({ code: -32601, message: 'Method not found' }), signAndSendTransaction });
    await expect(signAndSendPurchase(intent)).resolves.toBe('SIG2');
    expect(Array.from(signAndSendTransaction.mock.calls[0][0].serialize())).toEqual([1, 2, 3]);
  });
});
