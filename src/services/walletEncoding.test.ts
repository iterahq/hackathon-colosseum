import { describe, expect, it } from 'vitest';
import { assembleSignedTransaction, base58Decode, base64Decode, base64Encode, bytesOf, normalizeSignOnlyAnswer } from './walletEncoding';

describe('base58Decode', () => {
  it('decodes known vectors', () => {
    expect(Array.from(base58Decode('2NEpo7TZRRrLZSi2U'))).toEqual(Array.from(new TextEncoder().encode('Hello World!')));
    expect(Array.from(base58Decode('11112'))).toEqual([0, 0, 0, 0, 1]);
    expect(base58Decode('')).toHaveLength(0);
  });

  it('rejects a character outside the alphabet', () => {
    expect(() => base58Decode('0OIl')).toThrow();
  });
});

describe('base64', () => {
  it('round-trips, including url-safe input', () => {
    const bytes = Uint8Array.from([251, 255, 0, 1, 2]);
    expect(Array.from(base64Decode(base64Encode(bytes)))).toEqual(Array.from(bytes));
    expect(Array.from(base64Decode('-_8='))).toEqual([251, 255]);
  });
});

describe('bytesOf', () => {
  it('reads strings, arrays and buffer-like objects', () => {
    expect(Array.from(bytesOf('2')!)).toEqual([1]);
    expect(Array.from(bytesOf('AQID')!)).toEqual([1, 2, 3]);
    expect(Array.from(bytesOf([1, 2])!)).toEqual([1, 2]);
    expect(Array.from(bytesOf({ type: 'Buffer', data: [7, 8] })!)).toEqual([7, 8]);
    expect(bytesOf(null)).toBeNull();
  });
});

describe('normalizeSignOnlyAnswer', () => {
  const sig = new Uint8Array(64).fill(9);
  const tx = new Uint8Array(120).fill(3);
  tx[0] = 1;

  it('recognizes a bare or nested signature', () => {
    expect(normalizeSignOnlyAnswer(sig)).toEqual({ kind: 'signature', signature: sig });
    expect(normalizeSignOnlyAnswer({ signature: sig, publicKey: 'x' })).toEqual({ kind: 'signature', signature: sig });
    expect(normalizeSignOnlyAnswer({ signature: base64Encode(sig) })).toEqual({ kind: 'signature', signature: sig });
  });

  it('recognizes a whole signed transaction', () => {
    expect(normalizeSignOnlyAnswer(tx)).toEqual({ kind: 'transaction', transaction: tx });
    expect(normalizeSignOnlyAnswer({ signedTransaction: base64Encode(tx) })).toEqual({ kind: 'transaction', transaction: tx });
    expect(normalizeSignOnlyAnswer({ serialize: () => tx })).toEqual({ kind: 'transaction', transaction: tx });
  });

  it('returns null for anything else', () => {
    expect(normalizeSignOnlyAnswer(undefined)).toBeNull();
    expect(normalizeSignOnlyAnswer({ signature: '' })).toBeNull();
    expect(normalizeSignOnlyAnswer(new Uint8Array(10))).toBeNull();
  });
});

describe('assembleSignedTransaction', () => {
  it('lays out count, signature, message', () => {
    const out = assembleSignedTransaction(new Uint8Array(64).fill(5), Uint8Array.from([7, 8, 9]));
    expect(out).toHaveLength(68);
    expect(out[0]).toBe(1);
    expect(out[1]).toBe(5);
    expect(Array.from(out.slice(65))).toEqual([7, 8, 9]);
  });

  it('refuses a signature of the wrong size', () => {
    expect(() => assembleSignedTransaction(new Uint8Array(63), new Uint8Array(1))).toThrow();
  });
});
