import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PurchaseIntent } from '@/types/shop';
import { base64Decode, base64Encode } from './walletEncoding';
import { WalletSignError, classifyWalletError, signAndSendPurchase, signTextMessage } from './walletSign';

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
  payer: null,
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

  it('spots a dead blockhash', () => {
    expect(classifyWalletError({ code: -32003, message: 'Transaction simulation failed: Blockhash not found' }).reason).toBe('expired');
    expect(classifyWalletError(new Error('block height exceeded')).reason).toBe('expired');
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
    await expect(signAndSendPurchase(intent)).resolves.toEqual({ kind: 'sent', signature: 'SIG' });
    expect(request).toHaveBeenCalledWith({ method: 'signAndSendTransaction', params: { message: 'MSG58' } });
  });

  it('fails with no_wallet when nothing is injected', async () => {
    await expect(signAndSendPurchase(intent)).rejects.toMatchObject({ reason: 'no_wallet' });
  });

  it('prefers window.phantom.solana and accepts a bare string signature', async () => {
    const request = vi.fn().mockResolvedValue('SIGSTR');
    (window as unknown as { phantom?: unknown }).phantom = { solana: { connect: vi.fn(), request } };
    install({ request: vi.fn().mockRejectedValue(new Error('wrong provider')) });
    await expect(signAndSendPurchase(intent)).resolves.toEqual({ kind: 'sent', signature: 'SIGSTR' });
    delete (window as unknown as { phantom?: unknown }).phantom;
  });

  it('stops at a rejection: cancelled, no second attempt', async () => {
    quiet();
    const signAndSendTransaction = vi.fn();
    install({ request: vi.fn().mockRejectedValue({ code: 4001, message: 'User rejected the request.' }), signAndSendTransaction });
    await expect(signAndSendPurchase(intent)).rejects.toMatchObject({ reason: 'cancelled' });
    expect(signAndSendTransaction).not.toHaveBeenCalled();
  });

  it('never hands a duck-typed object to signAndSendTransaction: Phantom would only prompt twice for the same request', async () => {
    quiet();
    const signAndSendTransaction = vi.fn().mockResolvedValue({ signature: 'SIG2' });
    install({ request: vi.fn().mockRejectedValue({ code: -32603, message: 'Unexpected error' }), signAndSendTransaction });
    await expect(signAndSendPurchase(intent)).rejects.toMatchObject({ reason: 'failed' });
    expect(signAndSendTransaction).not.toHaveBeenCalled();
  });

  it('stops at a dead blockhash: expired, no sign-only prompt', async () => {
    quiet();
    const request = vi.fn().mockRejectedValue({ code: -32003, message: 'Blockhash not found' });
    install({ request });
    await expect(signAndSendPurchase(intent)).rejects.toMatchObject({ reason: 'expired' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('reports what every attempt said when all fail', async () => {
    quiet();
    install({ request: vi.fn().mockRejectedValue({ code: -32603, message: 'A' }) });
    await expect(signAndSendPurchase(intent)).rejects.toMatchObject({ reason: 'failed', detail: 'request → -32603: A | sign → -32603: A' });
  });

  it('falls back to sign-only and assembles the transaction from a bare signature', async () => {
    quiet();
    const signature = new Uint8Array(64).fill(7);
    const request = vi.fn().mockImplementation(async ({ method }: { method: string }) => {
      if (method === 'signTransaction') return { signature };
      throw { code: -32603, message: 'nope' };
    });
    install({ request });
    const result = await signAndSendPurchase(intent);
    expect(request).toHaveBeenLastCalledWith({ method: 'signTransaction', params: { message: 'MSG58' } });
    expect(result.kind).toBe('signed');
    const bytes = base64Decode((result as { signedTransaction: string }).signedTransaction);
    expect(Array.from(bytes.slice(0, 2))).toEqual([1, 7]);
    expect(Array.from(bytes.slice(65))).toEqual([4, 5, 6]);
  });

  it('passes a whole signed transaction through untouched', async () => {
    quiet();
    const tx = new Uint8Array(100).fill(2);
    tx[0] = 1;
    install({ request: vi.fn().mockImplementation(async ({ method }: { method: string }) => { if (method === 'signTransaction') return tx; throw new Error('x'); }) });
    await expect(signAndSendPurchase(intent)).resolves.toEqual({ kind: 'signed', signedTransaction: base64Encode(tx) });
  });

  it('never asks to sign-only after a rejection', async () => {
    quiet();
    const request = vi.fn().mockRejectedValue({ code: 4001, message: 'User rejected the request.' });
    install({ request });
    await expect(signAndSendPurchase(intent)).rejects.toMatchObject({ reason: 'cancelled' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('a rejection of the sign-only prompt is a cancel', async () => {
    quiet();
    install({ request: vi.fn().mockImplementation(async ({ method }: { method: string }) => { throw method === 'signTransaction' ? { code: 4001, message: 'User rejected' } : new Error('x'); }) });
    await expect(signAndSendPurchase(intent)).rejects.toMatchObject({ reason: 'cancelled' });
  });
});

describe('signTextMessage', () => {
  it('signs the utf8 bytes and returns base64 of the signature', async () => {
    const signMessage = vi.fn().mockResolvedValue({ signature: new Uint8Array(64).fill(1), publicKey: 'x' });
    install({ request: vi.fn(), signMessage });
    const out = await signTextMessage('hello');
    expect(Array.from(signMessage.mock.calls[0][0] as Uint8Array)).toEqual(Array.from(new TextEncoder().encode('hello')));
    expect(signMessage.mock.calls[0][1]).toBe('utf8');
    expect(base64Decode(out)).toHaveLength(64);
  });

  it('maps a rejection to cancelled', async () => {
    quiet();
    install({ request: vi.fn(), signMessage: vi.fn().mockRejectedValue({ code: 4001, message: 'User rejected' }) });
    await expect(signTextMessage('x')).rejects.toMatchObject({ reason: 'cancelled' });
  });
});
