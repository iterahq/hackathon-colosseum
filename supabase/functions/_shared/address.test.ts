import { describe, expect, it } from 'vitest';
import { isSolanaAddress } from './address';

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
