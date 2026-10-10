import { describe, expect, it } from 'vitest';
import {
  MINT_ACCOUNT_BYTES,
  burnData,
  createAccountData,
  createTokenAccountData,
  initializeMetadataData,
  initializeMetadataPointerData,
  initializeMintData,
  initializeNonTransferableMintData,
  initializePermanentDelegateData,
  mintBytesWithMetadata,
  mintToData,
} from './crystals-token.ts';

const KEY_A = new Uint8Array(32).fill(7);
const KEY_B = new Uint8Array(32).fill(9);

describe('crystal token instruction data', () => {
  it('sizes the mint for its three fixed extensions', () => {
    // 166 base + NonTransferable (4) + PermanentDelegate (36) + MetadataPointer (68)
    expect(MINT_ACCOUNT_BYTES).toBe(274);
  });

  it('adds the metadata entry to the size rent is paid for', () => {
    // header 4 + two keys 64 + "ab" 6 + "C" 5 + "u" 5 + empty list 4
    expect(mintBytesWithMetadata({ name: 'ab', symbol: 'C', uri: 'u' })).toBe(274 + 88);
    // Length is counted in bytes: "ê" is two.
    expect(mintBytesWithMetadata({ name: 'ê', symbol: 'C', uri: 'u' })).toBe(274 + 88);
  });

  it('encodes the system create-account call', () => {
    const data = createAccountData(1_000_000, 274, KEY_A);
    expect(data.length).toBe(4 + 8 + 8 + 32);
    expect([...data.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...data.slice(4, 12)]).toEqual([0x40, 0x42, 0x0f, 0, 0, 0, 0, 0]);
    expect([...data.slice(12, 20)]).toEqual([0x12, 0x01, 0, 0, 0, 0, 0, 0]);
    expect([...data.slice(20)]).toEqual([...KEY_A]);
  });

  it('encodes the mint initialisation: extensions first, no freeze authority', () => {
    expect([...initializeNonTransferableMintData()]).toEqual([32]);
    expect([...initializePermanentDelegateData(KEY_A)]).toEqual([35, ...KEY_A]);
    expect([...initializeMetadataPointerData(KEY_A, KEY_B)]).toEqual([39, 0, ...KEY_A, ...KEY_B]);
    expect([...initializeMintData(0, KEY_A)]).toEqual([20, 0, ...KEY_A, 0]);
  });

  it('encodes the metadata as three length-prefixed strings after the discriminator', () => {
    const data = initializeMetadataData({ name: 'Né', symbol: 'F', uri: 'https://x' });
    expect([...data.slice(0, 8)]).toEqual([210, 225, 30, 162, 88, 184, 77, 141]);
    expect([...data.slice(8, 15)]).toEqual([3, 0, 0, 0, 0x4e, 0xc3, 0xa9]);
    expect([...data.slice(15, 20)]).toEqual([1, 0, 0, 0, 0x46]);
    expect(data.length).toBe(8 + 7 + 5 + 4 + 9);
  });

  it('encodes mint, burn and the idempotent token account', () => {
    expect([...mintToData(258)]).toEqual([7, 2, 1, 0, 0, 0, 0, 0, 0]);
    expect([...burnData(5)]).toEqual([8, 5, 0, 0, 0, 0, 0, 0, 0]);
    expect([...createTokenAccountData()]).toEqual([1]);
  });

  it('refuses an amount that is not a whole, non-negative number', () => {
    expect(() => mintToData(-1)).toThrow();
    expect(() => burnData(1.5)).toThrow();
  });
});
