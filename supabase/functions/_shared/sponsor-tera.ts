import { escapeXml } from './art.ts';
import { APP_URL, type OnchainAttribute } from './credential.ts';
import { SYSTEM_PROGRAM, transferData } from './solana-tx.ts';
import type { Instruction } from './solana-message.ts';

/**
 * The sponsor Tera: a branded Tera a sponsor funds as the prize of a bounty.
 * Pure rules. The sponsor sends three small values (a name, a colour, one of a
 * few base Teras) and no file; the art is composed here.
 */

/** `itera.onchain_config.prize_tera`: `on` lets a bounty carry a prize Tera. */
export const PRIZE_SWITCH = 'prize_tera';
/** What minting the prize costs the authority (the rent of a Core asset with its attributes, and the fee), rounded up. */
export const PRIZE_MINT_LAMPORTS = 4_000_000n;
/** What Itera charges for issuing it. */
export const PRIZE_FEE_LAMPORTS = 10_000_000n;
export const PRIZE_TOTAL_LAMPORTS = PRIZE_MINT_LAMPORTS + PRIZE_FEE_LAMPORTS;
export const BRAND_MIN = 2;
export const BRAND_MAX = 24;
export const SPONSOR_RARITY = 'sponsor';
export const SPONSOR_TIER_NAME = { pt: 'Tera de patrocinador', en: 'Sponsor Tera' } as const;

/** The base Teras a sponsor picks from: free faces only, so a prize never hands out the art of a Tera that is sold or earned. */
export const PRIZE_BASES = ['tera_normal', 'tera_feliz', 'tera_determinado', 'tera_focado'] as const;
export type PrizeBase = (typeof PRIZE_BASES)[number];

export interface PrizeTera {
  brand: string;
  accent: string;
  base: PrizeBase;
}

const RESERVED_BRANDS = /itera|dev\s*fellowship|\bdfl\b|solana|colosseum|metaplex|phantom|official|oficial|verified|verificad/i;
const ACCENT = /^#[0-9a-f]{6}$/;

/**
 * The brand as it will be written on the art and on chain: 2 to 24 Unicode
 * letters and digits, spaces and `. & + - _ ! '`. Compatibility forms are
 * folded (NFKC), invisible control and direction characters are dropped and
 * spaces collapse; after that ANY other character (markup, quotes, emoji)
 * refuses the name, as does a name that poses as the team. Nothing is cut or
 * rewritten silently: what is minted is what the sponsor typed, or nothing.
 */
export function cleanBrand(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 200) return null;
  const brand = value
    .normalize('NFKC')
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const length = [...brand].length;
  if (length < BRAND_MIN || length > BRAND_MAX) return null;
  if (!/^[\p{L}\p{N} .&+\-_!']+$/u.test(brand) || !/[\p{L}\p{N}]/u.test(brand) || RESERVED_BRANDS.test(brand)) return null;
  return brand;
}

export type PrizeParse = { ok: true; value: PrizeTera | null } | { ok: false; error: 'invalid_prize_tera' };

/** The optional `prize_tera` of the posting form. Absent or `null`: no prize. Anything malformed refuses the whole form. */
export function parsePrizeTera(raw: unknown): PrizeParse {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'invalid_prize_tera' };
  const { brand, accent, base } = raw as Record<string, unknown>;
  const cleaned = cleanBrand(brand);
  const colour = typeof accent === 'string' ? accent.trim().toLowerCase() : '';
  if (!cleaned || !ACCENT.test(colour) || typeof base !== 'string' || !(PRIZE_BASES as readonly string[]).includes(base)) return { ok: false, error: 'invalid_prize_tera' };
  return { ok: true, value: { brand: cleaned, accent: colour, base: base as PrizeBase } };
}

/** A stored `bounties.prize_tera`, read back with the same rules (a row edited by hand cannot put markup on the art). */
export function prizeOf(stored: unknown): PrizeTera | null {
  const parsed = parsePrizeTera(stored);
  return parsed.ok ? parsed.value : null;
}

export function prizeQuote() {
  return { mint_lamports: Number(PRIZE_MINT_LAMPORTS), fee_lamports: Number(PRIZE_FEE_LAMPORTS), total_lamports: Number(PRIZE_TOTAL_LAMPORTS) };
}

/** The transfer the funding transaction carries next to the escrow's `create`: mint cost plus issuing fee, funder to treasury. */
export function prizeFeeInstruction(funder: string, treasury: string): Instruction {
  return { programId: SYSTEM_PROGRAM, accounts: [{ address: funder, signer: true, writable: true }, { address: treasury, writable: true }], data: transferData(PRIZE_TOTAL_LAMPORTS) };
}

/**
 * Whether a funding transaction paid for the prize: it succeeded and the
 * treasury's balance rose by at least the total inside it.
 */
export function paidPrizeFee(transaction: { meta: { err: unknown; preBalances: number[]; postBalances: number[] } | null; transaction: { message: { accountKeys: string[] } } } | null, treasury: string): boolean {
  if (!transaction?.meta || transaction.meta.err !== null) return false;
  const index = transaction.transaction.message.accountKeys.indexOf(treasury);
  if (index < 0) return false;
  return BigInt(transaction.meta.postBalances[index] ?? 0) - BigInt(transaction.meta.preBalances[index] ?? 0) >= PRIZE_TOTAL_LAMPORTS;
}

export function sponsorPreviewUrl(functionsBase: string, prize: PrizeTera): string {
  const query = new URLSearchParams({ brand: prize.brand, accent: prize.accent, base: prize.base });
  return `${functionsBase}/credential-meta/sponsor-preview.svg?${query.toString()}`;
}

export function sponsorImageUrl(functionsBase: string, rowId: string): string {
  return `${functionsBase}/credential-meta/sponsor/${rowId}/image.svg`;
}

export function sponsorMetadataUrl(functionsBase: string, rowId: string): string {
  return `${functionsBase}/credential-meta/sponsor/${rowId}`;
}

/** The on-chain name: the brand and the edition number. At most 32 + 12 characters. */
export function sponsorAssetName(prize: PrizeTera, edition: number): string {
  return `${prize.brand} · Sponsor Tera #${edition}`;
}

export interface SponsorIssue {
  prize: PrizeTera;
  edition: number;
  editionSize: number;
  wallet: string;
  bountyId: string;
  payoutSignature: string;
}

/** What the asset says on chain: a Tera (`kind`, `key`), how it was obtained, the brand, the bounty and the payout that earned it. */
export function sponsorAttributes(issue: SponsorIssue): OnchainAttribute[] {
  return [
    { key: 'kind', value: 'avatar' },
    { key: 'key', value: issue.prize.base },
    { key: 'rarity', value: SPONSOR_RARITY },
    { key: 'tier', value: SPONSOR_TIER_NAME.en },
    { key: 'serial', value: String(issue.edition) },
    { key: 'supply_cap', value: String(issue.editionSize) },
    { key: 'origin', value: 'sponsor' },
    { key: 'brand', value: issue.prize.brand },
    { key: 'accent', value: issue.prize.accent },
    { key: 'learner', value: issue.wallet },
    { key: 'bounty', value: issue.bountyId },
    { key: 'payout_tx', value: issue.payoutSignature },
  ];
}

/** `#rrggbb` as `r, g, b`, for the translucent fills. */
function rgb(accent: string): string {
  return [1, 3, 5].map((start) => Number.parseInt(accent.slice(start, start + 2), 16)).join(', ');
}

/** Dark text on a light accent, light on a dark one. */
function inkOn(accent: string): string {
  const [r, g, b] = [1, 3, 5].map((start) => Number.parseInt(accent.slice(start, start + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#10140f' : '#f6f2e7';
}

export interface SponsorArtInput {
  prize: PrizeTera;
  /** The base Tera's picture as a data URI; `null` draws the card without a picture rather than failing. */
  picture: string | null;
  /** A line under the brand: the bounty's title, or nothing on a preview. */
  caption?: string | null;
  /** `#1 of 1`; absent on a preview. */
  edition?: { number: number; size: number } | null;
}

/**
 * The composed art, 512 x 512. Every sponsor value reaches the SVG either
 * validated to a fixed alphabet (`accent`, `base`) or XML-escaped (`brand`,
 * `caption`); nothing a sponsor sends is ever a tag, an attribute or a URL.
 */
export function sponsorArt(input: SponsorArtInput): string {
  const { prize } = input;
  const accent = ACCENT.test(prize.accent) ? prize.accent : '#3fd17f';
  const brand = escapeXml(prize.brand);
  const size = [...prize.brand].length > 16 ? 30 : [...prize.brand].length > 10 ? 38 : 46;
  const caption = input.caption ? escapeXml([...input.caption].slice(0, 44).join('')) : '';
  const edition = input.edition ? `#${input.edition.number} OF ${input.edition.size}` : 'PREVIEW';
  const picture = input.picture && /^data:image\/(webp|png);base64,[A-Za-z0-9+/=]+$/.test(input.picture) ? `<image data-base="${escapeXml(prize.base)}" href="${input.picture}" x="136" y="118" width="240" height="240" preserveAspectRatio="xMidYMid meet"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="${brand} · Sponsor Tera">
<defs>
<radialGradient id="glow" cx="50%" cy="46%" r="52%"><stop offset="0" stop-color="rgb(${rgb(accent)})" stop-opacity="0.42"/><stop offset="1" stop-color="rgb(${rgb(accent)})" stop-opacity="0"/></radialGradient>
</defs>
<rect width="512" height="512" rx="36" fill="#0f1512"/>
<rect x="10" y="10" width="492" height="492" rx="28" fill="none" stroke="${accent}" stroke-width="4"/>
<rect x="22" y="22" width="468" height="468" rx="20" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="1.5" stroke-dasharray="3 7"/>
<circle cx="256" cy="238" r="170" fill="url(#glow)"/>
<circle cx="256" cy="238" r="128" fill="none" stroke="${accent}" stroke-opacity="0.55" stroke-width="2"/>
<text x="256" y="72" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="12" letter-spacing="3.2" fill="${accent}">SPONSOR TERA · BOUNTY PRIZE</text>
${picture}
<rect x="56" y="372" width="400" height="62" rx="14" fill="${accent}"/>
<text x="256" y="${size >= 46 ? 418 : 414}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="900" font-size="${size}" fill="${inkOn(accent)}" textLength="${[...prize.brand].length > 20 ? 372 : 0}" lengthAdjust="spacingAndGlyphs">${brand}</text>
<text x="256" y="458" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="13" fill="#f6f2e7" fill-opacity="0.72">${caption}</text>
<text x="256" y="482" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="9.5" letter-spacing="2" fill="#f6f2e7" fill-opacity="0.45">SOULBOUND · ${edition} · ITERA</text>
</svg>`.replace(' textLength="0" lengthAdjust="spacingAndGlyphs"', '');
}

/** Metaplex-standard JSON of a minted sponsor Tera. */
export function sponsorMetadata(input: { prize: PrizeTera; edition: number; editionSize: number; asset: string | null; imageUrl: string; bountyTitle: string; bountySlug: string; payoutSignature: string }) {
  return {
    name: sponsorAssetName(input.prize, input.edition),
    symbol: 'ITERA',
    description: `A sponsor Tera: the prize of the bounty "${input.bountyTitle}", branded by its sponsor (${input.prize.brand}) and minted by Itera to the wallet the bounty paid, in the settlement that paid it. Soulbound: it cannot be bought, sold or transferred. The brand is the sponsor's own text; Itera composed the art and vouches only for the payout it names.`,
    image: input.imageUrl,
    external_url: input.asset ? `${APP_URL}/c/${input.asset}` : `${APP_URL}/bounties/${input.bountySlug}`,
    attributes: [
      { trait_type: 'Kind', value: 'avatar' },
      { trait_type: 'Origin', value: 'sponsor' },
      { trait_type: 'Transferable', value: 'no' },
      { trait_type: 'Brand', value: input.prize.brand },
      { trait_type: 'Accent', value: input.prize.accent },
      { trait_type: 'Base', value: input.prize.base },
      { trait_type: 'Edition', value: `${input.edition} of ${input.editionSize}` },
      { trait_type: 'Bounty', value: input.bountySlug },
      { trait_type: 'Payout', value: input.payoutSignature },
    ],
    properties: { category: 'image', files: [{ uri: input.imageUrl, type: 'image/svg+xml' }] },
  };
}

/** The `prize_tera` of a bounty object. `funded`: the funding transaction paid the mint cost and the fee, so the prize WILL be issued. */
export function prizeView(input: { prize: PrizeTera | null; functionsBase: string; issued: number; funded: boolean; asset: string | null; rowId: string | null }) {
  if (!input.prize) return null;
  return {
    brand: input.prize.brand,
    accent: input.prize.accent,
    base: input.prize.base,
    image_url: input.rowId ? sponsorImageUrl(input.functionsBase, input.rowId) : sponsorPreviewUrl(input.functionsBase, input.prize),
    issued: input.issued,
    funded: input.funded,
    transferable: false,
    /** The Tera the payout minted, once it exists. */
    asset: input.asset,
    page_url: input.asset ? `${APP_URL}/c/${input.asset}` : null,
    explorer_url: input.asset ? `https://explorer.solana.com/address/${input.asset}?cluster=devnet` : null,
    ...prizeQuote(),
  };
}
