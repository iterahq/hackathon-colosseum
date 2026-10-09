import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PurchaseIntent } from '@/types/shop';
import { WalletSignError, classifyWalletError, signAndSendPurchase } from './walletSign';

const intent: PurchaseIntent = {
  intentId: 'i1',
  messageBase58: 'MSG58',
  messageBase64: 'BAUG',
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

const quiet = () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
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
    quiet();
    const request = vi.fn().mockResolvedValue({ signature: 'SIG' });
    install({ request });
    await expect(signAndSendPurchase(intent)).resolves.toBe('SIG');
    expect(request).toHaveBeenCalledWith({ method: 'signAndSendTransaction', params: { message: 'MSG58' } });
  });

  it('fails with no_wallet when nothing is injected', async () => {
    await expect(signAndSendPurchase(intent)).rejects.toMatchObject({ reason: 'no_wallet' });
  });

  it('prefers window.phantom.solana and accepts a bare string signature', async () => {
    const request = vi.fn().mockResolvedValue('SIGSTR');
    (window as unknown as { phantom?: unknown }).phantom = { solana: { connect: vi.fn(), request } };
    install({ request: vi.fn().mockRejectedValue(new Error('wrong provider')) });
    await expect(signAndSendPurchase(intent)).resolves.toBe('SIGSTR');
    delete (window as unknown as { phantom?: unknown }).phantom;
  });

  it('stops at a rejection: cancelled, no second attempt', async () => {
    quiet();
    const signAndSendTransaction = vi.fn();
    install({ request: vi.fn().mockRejectedValue({ code: 4001, message: 'User rejected the request.' }), signAndSendTransaction });
    await expect(signAndSendPurchase(intent)).rejects.toMatchObject({ reason: 'cancelled' });
    expect(signAndSendTransaction).not.toHaveBeenCalled();
  });

  it('falls back to the duck-typed transaction object when the request form fails', async () => {
    quiet();
    const signAndSendTransaction = vi.fn().mockResolvedValue({ signature: 'SIG2' });
    install({ request: vi.fn().mockRejectedValue({ code: -32603, message: 'Unexpected error' }), signAndSendTransaction });
    await expect(signAndSendPurchase(intent)).resolves.toBe('SIG2');
    const tx = signAndSendTransaction.mock.calls[0][0];
    expect(Array.from(tx.serializeMessage())).toEqual([4, 5, 6]);
    expect(Array.from(tx.serialize())).toEqual([1, 2, 3]);
    expect(tx.signatures).toEqual([]);
  });

  it('reports what every attempt said when both fail', async () => {
    quiet();
    install({ request: vi.fn().mockRejectedValue({ code: -32603, message: 'A' }), signAndSendTransaction: vi.fn().mockRejectedValue(new Error('B')) });
    await expect(signAndSendPurchase(intent)).rejects.toMatchObject({ reason: 'failed', detail: 'request → -32603: A | object → B' });
  });
});
