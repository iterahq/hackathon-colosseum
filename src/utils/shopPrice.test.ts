import { describe, expect, it } from 'vitest';
import { formatSol, formatSolBalance, formatUsdCents, priceLabel } from './shopPrice';

describe('shop price', () => {
  it('formats US cents', () => {
    expect(formatUsdCents(10)).toBe('US$ 0.10');
    expect(formatUsdCents(125)).toBe('US$ 1.25');
    expect(formatUsdCents(-4)).toBe('US$ 0.00');
  });

  it('shows a wallet balance with at most 4 decimals, rounded down', () => {
    expect(formatSolBalance(2_000_000_000)).toBe('2');
    expect(formatSolBalance(1_998_950_000)).toBe('1.9989');
    expect(formatSolBalance(10_000_000)).toBe('0.01');
    expect(formatSolBalance(99_999)).toBe('0');
    expect(formatSolBalance(-5)).toBe('0');
  });

  it('formats lamports as SOL without trailing zeros', () => {
    expect(formatSol(500_000)).toBe('0.0005');
    expect(formatSol(1_500_000_000)).toBe('1.5');
    expect(formatSol(2_000_000_000)).toBe('2');
    expect(formatSol(0)).toBe('0');
  });

  it("prefers the backend's label", () => {
    expect(priceLabel(' US$ 0.10 ≈ 0.0005 SOL ', 99, 99)).toBe('US$ 0.10 ≈ 0.0005 SOL');
  });

  it('builds the label when the backend sends none', () => {
    expect(priceLabel(null, 10, 500_000)).toBe('US$ 0.10 ≈ 0.0005 SOL');
    expect(priceLabel('', 30, 0)).toBe('US$ 0.30');
  });
});

describe('localizePriceLabel', () => {
  it('turns the backend US$ shape into Portuguese separators and leaves English alone', async () => {
    const { localizePriceLabel } = await import('./shopPrice');
    expect(localizePriceLabel('US$ 1,000.00 ≈ 0.5 SOL', 'pt')).toBe('US$ 1.000,00 ≈ 0.5 SOL');
    expect(localizePriceLabel('US$ 1.00', 'pt')).toBe('US$ 1,00');
    expect(localizePriceLabel('US$ 1,000.00', 'en')).toBe('US$ 1,000.00');
    expect(localizePriceLabel('100 000 cristais', 'pt')).toBe('100 000 cristais');
  });
});
