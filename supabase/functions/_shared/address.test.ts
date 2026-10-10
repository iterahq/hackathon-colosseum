import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isEd25519Address, isEd25519PublicKeyBytes, isSolanaAddress } from './address';
import { base58Encode } from './solana-tx';

describe('isSolanaAddress', () => {
  it('accepts 32-byte base58 keys', () => {
    expect(isSolanaAddress('CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B')).toBe(true);
    expect(isSolanaAddress('11111111111111111111111111111111')).toBe(true);
    expect(isSolanaAddress('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isSolanaAddress(undefined)).toBe(false);
    expect(isSolanaAddress('')).toBe(false);
    expect(isSolanaAddress('2'.repeat(32))).toBe(false);
    expect(isSolanaAddress('z'.repeat(44))).toBe(false);
    expect(isSolanaAddress('0Pq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B')).toBe(false);
    expect(isSolanaAddress('CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B/../x')).toBe(false);
    expect(isSolanaAddress('1111111111111111111111111111111111111111')).toBe(false);
  });
});

describe('isEd25519Address', () => {
  const P = (1n << 255n) - 19n;
  const D = 37095705934669439343138083508754565189542113879843219016388785533085940283555n;
  const pow = (base: bigint, exponent: bigint) => {
    let result = 1n;
    let power = base % P;
    for (let rest = exponent; rest > 0n; rest >>= 1n) {
      if (rest & 1n) result = (result * power) % P;
      power = (power * power) % P;
    }
    return result;
  };
  /** An independent reading of "on the curve": the square root the way RFC 8032 decompresses a point. */
  function decompresses(bytes: Uint8Array): boolean {
    let encoded = 0n;
    for (let index = 31; index >= 0; index -= 1) encoded = (encoded << 8n) | BigInt(bytes[index]);
    const y = encoded & ((1n << 255n) - 1n);
    if (y >= P) return false;
    const u = (y * y - 1n + P * P) % P;
    const v = (D * y * y + 1n) % P;
    const x = (u * pow(v, 3n) % P) * pow((u * pow(v, 7n)) % P, (P - 5n) / 8n) % P;
    const check = (v * x * x) % P;
    return check === u || check === (P - u) % P;
  }
  const le = (value: bigint) => {
    const bytes = new Uint8Array(32);
    for (let index = 0, rest = value; index < 32; index += 1, rest >>= 8n) bytes[index] = Number(rest & 0xffn);
    return bytes;
  };

  it('accepts every real public key', () => {
    for (let round = 0; round < 60; round += 1) {
      const raw = new Uint8Array(generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'der' }).subarray(-32));
      expect(isEd25519PublicKeyBytes(raw)).toBe(true);
      expect(isEd25519Address(base58Encode(raw))).toBe(true);
    }
    expect(isEd25519Address('CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B')).toBe(true);
    expect(isEd25519Address('AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA')).toBe(true);
  });

  it('refuses the System address, the other points of small order and non-canonical encodings', () => {
    expect(isEd25519Address('11111111111111111111111111111111')).toBe(false);
    const order8 = 2707385501144840649318225287225658788936804267575313519463743609750303402022n;
    for (const y of [0n, 1n, P - 1n, order8, P - order8]) {
      expect(isEd25519PublicKeyBytes(le(y))).toBe(false);
      const signed = le(y);
      signed[31] |= 0x80;
      expect(isEd25519PublicKeyBytes(signed)).toBe(false);
    }
    expect(isEd25519PublicKeyBytes(le(P))).toBe(false);
    expect(isEd25519PublicKeyBytes(le(P + 3n))).toBe(false);
    expect(isEd25519PublicKeyBytes(new Uint8Array(32).fill(0xff))).toBe(false);
    expect(isEd25519PublicKeyBytes(new Uint8Array(31))).toBe(false);
  });

  it('agrees with point decompression on random bytes, about half of which miss the curve', () => {
    let onCurve = 0;
    for (let round = 0; round < 400; round += 1) {
      const bytes = new Uint8Array(randomBytes(32));
      expect(isEd25519PublicKeyBytes(bytes)).toBe(decompresses(bytes));
      if (isEd25519PublicKeyBytes(bytes)) onCurve += 1;
    }
    expect(onCurve).toBeGreaterThan(140);
    expect(onCurve).toBeLessThan(260);
  });

  it('refuses what is not an address at all', () => {
    expect(isEd25519Address(undefined)).toBe(false);
    expect(isEd25519Address('nope')).toBe(false);
    expect(isEd25519Address(42)).toBe(false);
  });
});
