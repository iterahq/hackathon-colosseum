import { describe, expect, it } from 'vitest';
import {
  MEMO_PROGRAM,
  SYSTEM_PROGRAM,
  base58Decode,
  base58Encode,
  base64Encode,
  buildTransferMessage,
  compactU16,
  isSignature,
  serializeTransaction,
  transferData,
} from './solana-tx';

const PAYER = 'CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B';
const TREASURY = 'AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA';
const BLOCKHASH = '4WHw4Ghkx5Uxk5nn6FJdSsWwuj1nkcnq3D1vXsy19ZdG';
const MEMO = '0b0e1f7a-58e5-4f0c-9d55-7a1f6f1e2c3d';

describe('base58', () => {
  it('round-trips keys, keeping leading zero bytes', () => {
    expect(base58Encode(base58Decode(PAYER, 32) as Uint8Array)).toBe(PAYER);
    expect(base58Decode(SYSTEM_PROGRAM, 32)).toEqual(new Uint8Array(32));
    expect(base58Encode(new Uint8Array(32))).toBe(SYSTEM_PROGRAM);
  });

  it('rejects other alphabets and other lengths', () => {
    expect(base58Decode('0OIl', 32)).toBeNull();
    expect(base58Decode(PAYER, 64)).toBeNull();
    expect(isSignature(PAYER)).toBe(false);
    expect(isSignature(base58Encode(new Uint8Array(64).fill(7)))).toBe(true);
    expect(isSignature(42)).toBe(false);
  });
});

describe('transfer message', () => {
  it('encodes lengths as compact-u16', () => {
    expect(compactU16(0)).toEqual([0]);
    expect(compactU16(127)).toEqual([127]);
    expect(compactU16(128)).toEqual([0x80, 1]);
    expect(compactU16(16384)).toEqual([0x80, 0x80, 1]);
  });

  it('encodes the System transfer with integer lamports', () => {
    expect([...transferData(1_100_000n)]).toEqual([2, 0, 0, 0, 0xe0, 0xc8, 0x10, 0, 0, 0, 0, 0]);
    expect(() => transferData(0n)).toThrow();
    expect(() => transferData(1n << 64n)).toThrow();
  });

  it('lays out a legacy message: payer signs, transfer to the treasury, memo with the intent id', () => {
    const message = buildTransferMessage({ payer: PAYER, recipient: TREASURY, lamports: 1_100_000n, memo: MEMO, recentBlockhash: BLOCKHASH });
    expect([...message.slice(0, 4)]).toEqual([1, 0, 2, 4]);
    const keyAt = (index: number) => base58Encode(message.slice(4 + index * 32, 36 + index * 32));
    expect([keyAt(0), keyAt(1), keyAt(2), keyAt(3)]).toEqual([PAYER, TREASURY, SYSTEM_PROGRAM, MEMO_PROGRAM]);
    expect(keyAt(4)).toBe(BLOCKHASH);
    const instructions = [...message.slice(4 + 5 * 32)];
    expect(instructions.slice(0, 6)).toEqual([2, 2, 2, 0, 1, 12]);
    expect(instructions.slice(6, 18)).toEqual([...transferData(1_100_000n)]);
    expect(instructions.slice(18, 21)).toEqual([3, 0, MEMO.length]);
    expect(new TextDecoder().decode(Uint8Array.from(instructions.slice(21)))).toBe(MEMO);
    expect(message[0] & 0x80).toBe(0);
  });

  it('refuses a self transfer and an empty memo', () => {
    const input = { payer: PAYER, recipient: TREASURY, lamports: 1n, memo: MEMO, recentBlockhash: BLOCKHASH };
    expect(() => buildTransferMessage({ ...input, recipient: PAYER })).toThrow();
    expect(() => buildTransferMessage({ ...input, memo: '' })).toThrow();
    expect(() => buildTransferMessage({ ...input, payer: 'not-a-key' })).toThrow();
  });

  it('wraps the message with one signature slot', () => {
    const message = buildTransferMessage({ payer: PAYER, recipient: TREASURY, lamports: 1n, memo: MEMO, recentBlockhash: BLOCKHASH });
    const unsigned = serializeTransaction(message);
    expect(unsigned.length).toBe(1 + 64 + message.length);
    expect(unsigned[0]).toBe(1);
    expect(unsigned.slice(1, 65).every((byte) => byte === 0)).toBe(true);
    expect(serializeTransaction(message, new Uint8Array(64).fill(9))[1]).toBe(9);
    expect(() => serializeTransaction(message, new Uint8Array(10))).toThrow();
    expect(base64Encode(Uint8Array.from([1, 2, 3]))).toBe('AQID');
  });
});
