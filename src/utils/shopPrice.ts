/** Price text of the shop. The backend's `price_label` wins; this is the fallback and the mock's formatter. */
const LAMPORTS_PER_SOL = 1_000_000_000;

export function formatUsdCents(cents: number): string {
  return `US$ ${(Math.max(0, cents) / 100).toFixed(2)}`;
}

/** 500000 -> "0.0005"; trims trailing zeros, keeps at most 6 decimals. */
export function formatSol(lamports: number): string {
  const sol = Math.max(0, lamports) / LAMPORTS_PER_SOL;
  const text = sol.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  return text === '' ? '0' : text;
}

/** A wallet balance as a wallet shows it: at most 4 decimals, never rounded up past what the wallet holds. 1998950000 -> "1.9989". */
export function formatSolBalance(lamports: number): string {
  const units = Math.floor(Math.max(0, lamports) / 100_000);
  const text = (units / 10_000).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return text === '' ? '0' : text;
}

/** "US$ 1,000.00" is the backend's English shape; a Portuguese screen reads it as "US$ 1.000,00". The SOL part is left as is. */
export function localizePriceLabel(label: string, locale: string): string {
  if (locale !== 'pt') return label;
  return label.replace(/US\$\s*(\d{1,3}(?:,\d{3})*)\.(\d{2})/g, (_, whole: string, cents: string) => `US$ ${whole.replace(/,/g, '.')},${cents}`);
}

/** "0.38 SOL" is the API's English shape; a Portuguese screen reads "0,38 SOL". */
export function localizeDecimal(text: string, locale: string): string {
  if (locale !== 'pt') return text;
  return text.replace(/(\d)\.(\d)/g, '$1,$2');
}

export function priceLabel(label: string | null | undefined, cents: number, lamports: number): string {
  if (label && label.trim()) return label.trim();
  return lamports > 0 ? `${formatUsdCents(cents)} ≈ ${formatSol(lamports)} SOL` : formatUsdCents(cents);
}
