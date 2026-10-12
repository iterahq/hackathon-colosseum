/** The sponsor's brand Tera, on the form side: the same rule the server applies, so the sponsor sees why a name is refused before sending it. */
import type { PrizeTeraInput } from '@/types/bounty';

/** Mirrors `cleanBrand` of `_shared/sponsor-tera.ts`. The server stays the judge: this only explains its answer early. */
const RESERVED = /itera|dev\s*fellowship|\bdfl\b|solana|colosseum|metaplex|phantom|official|oficial|verified|verificad/i;
const ALLOWED = /^[\p{Script=Latin}0-9 .&+\-_!']+$/u;
const ACCENT = /^#[0-9a-f]{6}$/i;

export type BrandError = 'short' | 'long' | 'chars' | 'reserved';

export const tidyBrand = (value: string): string => value.normalize('NFKC').replace(/\s+/g, ' ').trim();

export function brandError(value: string, min: number, max: number): BrandError | null {
  const brand = tidyBrand(value);
  const length = [...brand].length;
  if (length < min) return 'short';
  if (length > max) return 'long';
  if (!ALLOWED.test(brand) || !/[\p{Script=Latin}0-9]/u.test(brand)) return 'chars';
  return RESERVED.test(brand) ? 'reserved' : null;
}

export const isAccent = (value: string): boolean => ACCENT.test(value.trim());

/**
 * Whether the form may be sent. A name that reads like a team is NOT refused here: the server accepts it from an
 * account that is staff of that team, and only the server knows who is asking.
 */
export const brandBlocks = (error: BrandError | null): boolean => error !== null && error !== 'reserved';

/** The server-composed art for these three values; null while they are not valid, so no request is made for a name still being typed. */
export function prizePreviewUrl(previewUrl: string | null, prize: PrizeTeraInput, min: number, max: number): string | null {
  if (!previewUrl || brandError(prize.brand, min, max) || !isAccent(prize.accent) || !prize.base) return null;
  const query = new URLSearchParams({ brand: tidyBrand(prize.brand), accent: prize.accent.trim().toLowerCase(), base: prize.base });
  return `${previewUrl}${previewUrl.includes('?') ? '&' : '?'}${query.toString()}`;
}
