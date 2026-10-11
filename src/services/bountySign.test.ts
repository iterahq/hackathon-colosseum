import { afterEach, describe, expect, it, vi } from 'vitest';
import { BountySignError, parseSignOffer, signOffer, signatureFromTransaction, type SignOffer } from '@/services/bountySign';
import { base58Decode, base64Encode } from '@/services/walletEncoding';

const FEE_PAYER = 'AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA';
const LEARNER = '95SAp7c7fHSurHmR2H42oopwHfkr2c4aV5wwYsyQpMAc';

/** A two-signer legacy message: header, two keys, then filler standing for the blockhash and instructions. */
const message = Uint8Array.from([2, 1, 0, 2, ...base58Decode(FEE_PAYER), ...base58Decode(LEARNER), ...new Array<number>(40).fill(9)]);
const offer: SignOffer = { messageBase58: 'msg58', messageBase64: base64Encode(message), signer: LEARNER, feePayer: FEE_PAYER };
const signature = new Uint8Array(64).fill(5);

function installWallet(request: (args: { method: string; params?: unknown }) => Promise<unknown>, address = LEARNER) {
  const provider = { publicKey: { toString: () => address }, connect: vi.fn().mockResolvedValue(undefined), request: vi.fn(request) };
  (window as unknown as { phantom?: unknown }).phantom = { solana: provider };
  return provider;
}

afterEach(() => {
  delete (window as unknown as { phantom?: unknown }).phantom;
  vi.restoreAllMocks();
});

describe('parseSignOffer', () => {
  it('reads the offer the backend answers', () => {
    expect(parseSignOffer({ message_base58: 'a', message_base64: 'b', signer: LEARNER, fee_payer: FEE_PAYER })).toEqual({ messageBase58: 'a', messageBase64: 'b', signer: LEARNER, feePayer: FEE_PAYER });
  });

  it('answers null for a missing field or no offer', () => {
    expect(parseSignOffer({ message_base58: 'a', signer: LEARNER, fee_payer: FEE_PAYER })).toBeNull();
    expect(parseSignOffer(null)).toBeNull();
  });
});

describe('signatureFromTransaction', () => {
  it("takes the signer's slot out of a signed transaction and keeps the message as signed", () => {
    const transaction = Uint8Array.from([2, ...new Array<number>(64).fill(0), ...signature, ...message]);
    const found = signatureFromTransaction(transaction, LEARNER);
    expect([...(found?.signature ?? [])]).toEqual([...signature]);
    expect([...(found?.message ?? [])]).toEqual([...message]);
  });

  it('answers null when the signer left its slot empty or is not a signer of the message', () => {
    expect(signatureFromTransaction(Uint8Array.from([2, ...new Array<number>(128).fill(0), ...message]), LEARNER)).toBeNull();
    expect(signatureFromTransaction(Uint8Array.from([2, ...signature, ...signature, ...message]), 'EANhMJvJo2dKjEosCmExDvrzxn5LhT8R51nanJpcaXu5')).toBeNull();
    expect(signatureFromTransaction(Uint8Array.of(0), LEARNER)).toBeNull();
  });
});

describe('signOffer', () => {
  it('asks the wallet to sign the message only, and answers message + signature in base64', async () => {
    const wallet = installWallet(async () => ({ signature, publicKey: LEARNER }));
    await expect(signOffer(offer)).resolves.toEqual({ message: offer.messageBase64, signature: base64Encode(signature) });
    expect(wallet.request).toHaveBeenCalledWith({ method: 'signTransaction', params: { message: 'msg58' } });
    expect(wallet.request).toHaveBeenCalledTimes(1);
  });

  it('accepts a wallet that hands the whole signed transaction back', async () => {
    installWallet(async () => ({ transaction: Uint8Array.from([2, ...new Array<number>(64).fill(0), ...signature, ...message]) }));
    await expect(signOffer(offer)).resolves.toEqual({ message: offer.messageBase64, signature: base64Encode(signature) });
  });

  it('never signs with a wallet that is not the one of the account', async () => {
    const wallet = installWallet(async () => ({ signature }), 'EANhMJvJo2dKjEosCmExDvrzxn5LhT8R51nanJpcaXu5');
    await expect(signOffer(offer)).rejects.toMatchObject({ code: 'wrong_wallet' });
    expect(wallet.request).not.toHaveBeenCalled();
  });

  it('tells a refusal in the wallet apart from a failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    installWallet(async () => Promise.reject(Object.assign(new Error('User rejected the request.'), { code: 4001 })));
    await expect(signOffer(offer)).rejects.toMatchObject({ code: 'wallet_cancelled' });
    installWallet(async () => Promise.reject(new Error('boom')));
    await expect(signOffer(offer)).rejects.toMatchObject({ code: 'wallet_failed' });
    installWallet(async () => ({}));
    await expect(signOffer(offer)).rejects.toBeInstanceOf(BountySignError);
  });

  it('says so when the browser has no wallet', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(signOffer(offer)).rejects.toMatchObject({ code: 'no_wallet' });
  });
});
