import { isEd25519Address } from './address.ts';
import { APP_URL, CLUSTER, explorerUrl, pickText } from './credential.ts';
import { ACTION_VERSION, dialToUrl, shortWallet, solAmount, type Lang } from './gift.ts';
import { staticCheckResults, type HtmlParser } from './grading.ts';
import { isVerified, type OnchainAsset } from './profile.ts';
import { BASE_FEE_LAMPORTS } from './purchase-verify.ts';
import { parsePrizeTera, prizeOf, prizeView, type PrizeTera } from './sponsor-tera.ts';
import type { SignatureFate } from './treasury.ts';

export { ACTION_VERSION };

export type BountyStatus = 'awaiting_funding' | 'open' | 'claimed' | 'submitted' | 'paying' | 'paid' | 'refunding' | 'refunded';
export type PublicStatus = BountyStatus | 'expired';
export type ClaimStatus = 'active' | 'submitted' | 'approved' | 'rejected' | 'expired' | 'withdrawn';
export type I18n = Record<string, string>;

export const MIN_REWARD_LAMPORTS = 1_000_000n;
export const MAX_REWARD_LAMPORTS = 500_000_000n;
/** A bounty posted by a wallet: what it must lock at least, how many it may post a day and keep live at once. */
export const WALLET_MIN_REWARD_LAMPORTS = 10_000_000n;
export const WALLET_POSTS_PER_DAY = 3;
export const WALLET_LIVE_BOUNTIES = 5;
export const WALLET_MAX_EXPIRY_DAYS = 30;
export const WALLET_MAX_CLAIM_HOURS = 168;
/** Names a wallet may not post under: they are the team's. */
const RESERVED_SPONSORS = /itera|dev\s*fellowship|\bdfl\b|solana\s*foundation|colosseum/i;
/** A transfer whose signature the node does not know is sent again only after its blockhash is surely dead. */
export const TRANSFER_LEASE_MS = 150_000;
const TRAIL_ATTRIBUTE_MAX = 80;
const SLUG = /^[a-z0-9][a-z0-9-]{2,62}$/;

/** What a wallet must hold on chain to take a bounty: `min_days` stamped days of one trail. */
export interface Requirement {
  program: string;
  unit_id: string;
  /** The `trail` attribute the certification carries on chain. */
  trail: string;
  trail_title: I18n;
  min_days: number;
  total_days: number;
}

export interface BountyRow {
  id: string;
  slug: string;
  tenant_id: string;
  sponsor_name: string;
  title_i18n: I18n;
  summary_i18n: I18n;
  brief_i18n: I18n;
  deliverable_i18n: I18n;
  requirement: Requirement;
  reward_lamports: number;
  escrow_kind: 'derived_account' | 'program';
  escrow_address: string;
  refund_address: string;
  status: BountyStatus;
  claim_id: string | null;
  claim_hours: number;
  expires_at: string;
  funded_at: string | null;
  funded_lamports: number | null;
  funding_signature: string | null;
  transfer_signature: string | null;
  transfer_sent_at: string | null;
  transfer_lamports: number | null;
  paid_at: string | null;
  paid_wallet: string | null;
  payout_lamports: number | null;
  payout_signature: string | null;
  refunded_at: string | null;
  refund_lamports: number | null;
  refund_signature: string | null;
  created_at: string;
  /** `team`: posted by Itera's staff and funded from the treasury. `wallet`: posted, funded and approved by `sponsor_wallet`. */
  origin: 'team' | 'wallet';
  sponsor_wallet: string | null;
  /** The key the escrow program lets approve. `null`: the Itera treasury key. */
  approver_address: string | null;
  slug_en: string | null;
  source_lang: 'pt' | 'en' | null;
  hidden_at: string | null;
  hidden_reason: string | null;
  delivery_mirror_url: string | null;
  created_by: string | null;
  /** The escrow account names the trail and the days in its terms and the program reads them at `accept` (no attester). */
  escrow_gated: boolean;
  /** A bounty judged by a mechanical check: a delivery that passes is approved and paid with nobody reviewing it. */
  auto_check: AutoCheck | null;
  /** The template this bounty was refilled from (`itera.bounty_templates`). */
  template_key: string | null;
  /** A direct bounty: the one wallet that may accept it, named in the escrow account and in its address. `null`: any eligible wallet. */
  invitee_wallet: string | null;
  /** A sponsor Tera as prize: `{ brand, accent, base }` as stored at posting, or `null`. Read through `prizeOf`. */
  prize_tera?: unknown;
  /** The funding transaction, once it was seen to pay the mint cost and the issuing fee of the prize. */
  prize_fee_signature?: string | null;
  prize_issued?: number | null;
  /** The sponsor Tera the payout minted. */
  prize_asset?: string | null;
}

/** The lesson engine's static HTML asserts, run on the code a learner pastes as their delivery. */
export interface AutoCheck {
  version: number;
  language: 'html';
  checks: Array<{ id: string; label: I18n; selector?: string; assert: Record<string, unknown> }>;
}

export const DELIVERY_CODE_MAX = 8000;

/** What a refilled bounty is made from. */
export interface BountyTemplate {
  key: string;
  active: boolean;
  /** How many bounties of this template stay available at once. */
  keep_open: number;
  /** How many may be created in any 24 hours. */
  daily_cap: number;
  payload: {
    sponsor_name: string;
    title_i18n: I18n;
    summary_i18n: I18n;
    brief_i18n: I18n;
    deliverable_i18n: I18n;
    unit_id: string;
    min_days: number;
    reward_lamports: number;
    claim_hours: number;
    expires_days: number;
    auto_check: AutoCheck;
  };
}

/** How many bounties a refill creates now: up to `keep_open` available, never past what is left of the day's cap. */
export function refillCount(template: Pick<BountyTemplate, 'active' | 'keep_open' | 'daily_cap'>, available: number, createdLast24h: number): number {
  if (!template.active) return 0;
  return Math.max(0, Math.min(template.keep_open - available, template.daily_cap - createdLast24h));
}

export interface ClaimRow {
  id: string;
  bounty_id: string;
  user_id: string;
  wallet: string;
  proof_asset: string;
  proof: Record<string, unknown>;
  status: ClaimStatus;
  accepted_at: string;
  deadline_at: string;
  submission_url: string | null;
  submission_note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  submission_code: string | null;
  check_report: CheckReport | null;
}

export interface CheckReport {
  version: number;
  passed: boolean;
  checks: Array<{ id: string; passed: boolean }>;
  checked_at: string;
}

export interface EventRow {
  id: number;
  bounty_id: string;
  kind: string;
  wallet: string | null;
  lamports: number | null;
  signature: string | null;
  /** The wallet that signed the program's instruction of this step. `null`: not recorded (a step from before learners signed, or one with no transaction). */
  signer?: string | null;
  created_at: string;
}

export type SignerRole = 'learner' | 'sponsor' | 'funder' | 'itera_treasury' | 'itera_key';

/**
 * Whose key signed a step, by the key itself and never by the kind of step: the learner named by the step, the
 * sponsor's wallet, Itera's treasury (it funds the team's own bounties) or Itera's attester key. `funder`: another
 * wallet locked the reward of a bounty a wallet posted (the public funding link). `null`: no signer recorded.
 */
export function signerRole(event: Pick<EventRow, 'kind' | 'wallet' | 'signature' | 'signer'>, bounty: Pick<BountyRow, 'origin' | 'sponsor_wallet' | 'refund_address'>): SignerRole | null {
  const signer = event.signature ? (event.signer ?? null) : null;
  if (!signer) return null;
  if (bounty.origin === 'wallet') {
    if (signer === bounty.sponsor_wallet) return 'sponsor';
    if (event.kind === 'funded') return 'funder';
  } else if (signer === bounty.refund_address) return 'itera_treasury';
  if ((event.kind === 'accepted' || event.kind === 'withdrawn') && signer === event.wallet) return 'learner';
  return 'itera_key';
}

export interface SignedTransactionFacts {
  /** The keys that signed, in the order of the message. */
  signers: readonly string[];
  accountKeys: readonly string[];
  instructions: ReadonlyArray<{ accounts: readonly number[] }>;
}

/**
 * The wallet a ledger row of a wallet-posted bounty is signed by: the sponsor's when it signed the transaction;
 * on the funding step alone, otherwise, the funder the escrow program's `create` names (its first account, the
 * bounty's own account being the second) when that key signed. `null`: neither can be shown from the transaction.
 */
export function stepSigner(tx: SignedTransactionFacts, bounty: Pick<BountyRow, 'sponsor_wallet' | 'escrow_address'>, kind: string): string | null {
  if (bounty.sponsor_wallet && tx.signers.includes(bounty.sponsor_wallet)) return bounty.sponsor_wallet;
  if (kind !== 'funded') return null;
  for (const instruction of tx.instructions) {
    if (tx.accountKeys[instruction.accounts[1]] !== bounty.escrow_address) continue;
    const funder = tx.accountKeys[instruction.accounts[0]];
    if (funder && tx.signers.includes(funder)) return funder;
  }
  return null;
}

export type FundingLinkVerdict = 'ok' | 'not_found' | 'not_fundable';

/**
 * Whether the public funding link (the Solana Action) may build a transaction for a bounty. A bounty moderation
 * hid is not offered at all; one that is funded, closed or past its date has nothing left to fund.
 */
export function fundingLinkVerdict(bounty: Pick<BountyRow, 'status' | 'expires_at' | 'hidden_at'>, now: Date): FundingLinkVerdict {
  if (bounty.hidden_at) return 'not_found';
  return publicStatus(bounty, now) === 'awaiting_funding' ? 'ok' : 'not_fundable';
}

/** The value `credential.ts` writes in a certification's `trail` attribute. */
export function trailAttribute(titleEn: string): string {
  return titleEn.length <= TRAIL_ATTRIBUTE_MAX ? titleEn : `${titleEn.slice(0, TRAIL_ATTRIBUTE_MAX - 1).trimEnd()}…`;
}

/** What a server-held escrow account must hold for a bounty to open: the reward and the fee of the one transfer that empties it. */
export function fundingTarget(rewardLamports: bigint | number): bigint {
  return BigInt(rewardLamports) + BASE_FEE_LAMPORTS;
}

/**
 * What funding a bounty costs its sponsor. A program escrow costs the reward
 * plus the rent of its account (`escrowRentLamports`, asked from the node).
 */
export function fundingCost(bounty: Pick<BountyRow, 'escrow_kind' | 'reward_lamports'>, escrowRentLamports: bigint): bigint {
  return bounty.escrow_kind === 'program' ? BigInt(bounty.reward_lamports) + escrowRentLamports : fundingTarget(bounty.reward_lamports);
}

/**
 * What leaves an escrow account holding `balance`: everything but the fee, so
 * the account ends at zero and a second transfer has nothing to send. `null`
 * when there is nothing to send.
 */
export function drainLamports(balance: bigint): bigint | null {
  const lamports = balance - BASE_FEE_LAMPORTS;
  return lamports > 0n ? lamports : null;
}

export function transferMemo(bountyId: string, kind: 'fund' | 'accept' | 'give-up' | 'expired' | 'rejected' | 'payout' | 'refund'): string {
  return `itera-bounty:${bountyId}:${kind}`;
}

export function publicStatus(bounty: Pick<BountyRow, 'status' | 'expires_at'>, now: Date): PublicStatus {
  const expired = Date.parse(bounty.expires_at) <= now.getTime();
  return expired && (bounty.status === 'open' || bounty.status === 'awaiting_funding') ? 'expired' : bounty.status;
}

function attribute(asset: OnchainAsset, key: string): string {
  return asset.attributes.find((entry) => entry.key === key)?.value ?? '';
}

export type IneligibleReason = 'not_invited' | 'no_wallet' | 'no_certification' | 'not_enough_days';

/** Whether a bounty was posted for one wallet and `wallet` is not that one. */
export function notInvited(bounty: Pick<BountyRow, 'invitee_wallet'>, wallet: string | null): boolean {
  return Boolean(bounty.invitee_wallet) && bounty.invitee_wallet !== wallet;
}

export interface Eligibility {
  eligible: boolean;
  reason: IneligibleReason | null;
  /** The certification that satisfies (or comes closest to) the requirement, as read from chain. */
  proof: { asset: string; days_done: number; explorer_url: string | null } | null;
}

/**
 * Whether a wallet may take a bounty. Every fact comes from `assets`, the Core
 * accounts as read from chain: the owner, our collection under our authority,
 * the soulbound freeze, and the `program` / `trail` / `days_done` attributes.
 * A direct bounty (`invitee`) is nobody else's to take, whatever they hold:
 * that is answered first.
 */
export function checkEligibility(input: {
  wallet: string | null;
  requirement: Requirement;
  assets: readonly OnchainAsset[];
  collection: string | undefined;
  authority: string | undefined;
  invitee?: string | null;
}): Eligibility {
  const { wallet, requirement } = input;
  if (input.invitee && input.invitee !== wallet) return { eligible: false, reason: 'not_invited', proof: null };
  if (!wallet) return { eligible: false, reason: 'no_wallet', proof: null };
  let best: { asset: string; days: number } | null = null;
  for (const asset of input.assets) {
    if (!isVerified(asset, { wallet, collection: input.collection, authority: input.authority })) continue;
    if (attribute(asset, 'kind') !== 'trail_passport') continue;
    if (attribute(asset, 'program') !== requirement.program || attribute(asset, 'trail') !== requirement.trail) continue;
    const text = attribute(asset, 'days_done');
    const days = /^\d{1,4}$/.test(text) ? Number(text) : 0;
    if (!best || days > best.days) best = { asset: asset.address, days };
  }
  if (!best) return { eligible: false, reason: 'no_certification', proof: null };
  const proof = { asset: best.asset, days_done: best.days, explorer_url: explorerUrl('address', best.asset) };
  return best.days >= requirement.min_days ? { eligible: true, reason: null, proof } : { eligible: false, reason: 'not_enough_days', proof };
}

export type TransferStep = 'settled' | 'wait' | 'send';

/**
 * What to do with a payout or refund that may already have been sent.
 * `settled`: the recorded signature landed. `wait`: it may still land, or
 * another request holds the lease. `send`: nothing is in flight.
 */
export function transferStep(facts: { signature: string | null; fate: SignatureFate | null; sentAt: string | null; now: Date }): TransferStep {
  if (facts.signature && facts.fate === 'landed') return 'settled';
  if (facts.signature && facts.fate === 'in_flight') return 'wait';
  const leased = facts.sentAt !== null && facts.now.getTime() - Date.parse(facts.sentAt) < TRANSFER_LEASE_MS;
  if (facts.signature && facts.fate === 'failed') return 'send';
  return leased ? 'wait' : 'send';
}

function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
}

function i18n(value: unknown, min: number, max: number): I18n | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const pt = text(record.pt, min, max);
  const en = text(record.en, min, max);
  return pt && en ? { pt, en } : null;
}

export interface NewBounty {
  slug: string;
  sponsor_name: string;
  title_i18n: I18n;
  summary_i18n: I18n;
  brief_i18n: I18n;
  deliverable_i18n: I18n;
  reward_lamports: number;
  unit_id: string;
  min_days: number;
  claim_hours: number;
  expires_at: string;
  refund_address: string | null;
}

export type NewBountyError =
  | 'invalid_slug'
  | 'invalid_sponsor'
  | 'invalid_text'
  | 'invalid_reward'
  | 'invalid_requirement'
  | 'invalid_deadline'
  | 'invalid_refund_address';

/** A sponsor's form, checked. Nothing here trusts the caller for who they are: only for what the bounty says. */
export function parseNewBounty(body: Record<string, unknown>, now: Date): { ok: true; value: NewBounty } | { ok: false; error: NewBountyError } {
  const slug = text(body.slug, 3, 63);
  if (!slug || !SLUG.test(slug)) return { ok: false, error: 'invalid_slug' };
  const sponsor = text(body.sponsor_name, 1, 80);
  if (!sponsor) return { ok: false, error: 'invalid_sponsor' };
  const title = i18n(body.title, 4, 90);
  const summary = i18n(body.summary, 10, 220);
  const brief = i18n(body.brief, 20, 2400);
  const deliverable = i18n(body.deliverable, 5, 400);
  if (!title || !summary || !brief || !deliverable) return { ok: false, error: 'invalid_text' };
  const reward = typeof body.reward_lamports === 'number' && Number.isSafeInteger(body.reward_lamports) ? BigInt(body.reward_lamports) : null;
  if (reward === null || reward < MIN_REWARD_LAMPORTS || reward > MAX_REWARD_LAMPORTS) return { ok: false, error: 'invalid_reward' };
  const unitId = text(body.unit_id, 36, 36);
  const minDays = body.min_days;
  if (!unitId || typeof minDays !== 'number' || !Number.isInteger(minDays) || minDays < 1 || minDays > 60) return { ok: false, error: 'invalid_requirement' };
  const days = body.expires_in_days;
  const claimHours = body.claim_hours ?? 72;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 90) return { ok: false, error: 'invalid_deadline' };
  if (typeof claimHours !== 'number' || !Number.isInteger(claimHours) || claimHours < 1 || claimHours > 720) return { ok: false, error: 'invalid_deadline' };
  const refund = body.refund_address ?? null;
  if (refund !== null && !isEd25519Address(refund)) return { ok: false, error: 'invalid_refund_address' };
  return {
    ok: true,
    value: {
      slug,
      sponsor_name: sponsor,
      title_i18n: title,
      summary_i18n: summary,
      brief_i18n: brief,
      deliverable_i18n: deliverable,
      reward_lamports: Number(reward),
      unit_id: unitId,
      min_days: minDays,
      claim_hours: claimHours,
      expires_at: new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString(),
      refund_address: refund as string | null,
    },
  };
}

/** Lowercase ASCII words of a title, joined by dashes: the readable part of a slug. */
export function slugify(title: string, max = 48): string {
  const words = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return words.slice(0, max).replace(/-+$/, '') || 'bounty';
}

export function clean(value: unknown): unknown {
  // deno-lint-ignore no-control-regex
  return typeof value === 'string' ? value.normalize('NFKC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '') : value;
}

/** A text given in one language or in both. The missing one repeats the other, and `source` says which was written. */
function oneOrBoth(value: unknown, min: number, max: number): { texts: I18n; source: 'pt' | 'en' } | null {
  const record = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const pt = text(clean(record.pt), min, max);
  const en = text(clean(record.en), min, max);
  if ((record.pt && !pt) || (record.en && !en)) return null;
  if (!pt && !en) return null;
  return { texts: { pt: (pt ?? en) as string, en: (en ?? pt) as string }, source: en ? 'en' : 'pt' };
}

export interface NewWalletBounty extends Omit<NewBounty, 'slug' | 'refund_address'> {
  source_lang: 'pt' | 'en';
  /** A branded Tera minted to the learner the bounty pays. `null`: no prize. */
  prize_tera: PrizeTera | null;
  /** A direct bounty: the one wallet it is posted for. */
  invitee_wallet: string | null;
}

export type NewWalletBountyError = NewBountyError | 'invalid_invitee' | 'own_invitee' | 'invalid_prize_tera';

/**
 * The form of a wallet that posts a bounty. Stricter than the staff form: a
 * floor on the reward, shorter deadlines, no name of the team, and the slug
 * and every address are decided by the server. `invitee_wallet` makes it a
 * direct bounty: a wallet address, and never `sponsorWallet`'s own.
 */
export function parseWalletBounty(body: Record<string, unknown>, now: Date, sponsorWallet?: string): { ok: true; value: NewWalletBounty } | { ok: false; error: NewWalletBountyError } {
  const sponsor = text(clean(body.sponsor_name), 2, 40);
  if (!sponsor || RESERVED_SPONSORS.test(sponsor)) return { ok: false, error: 'invalid_sponsor' };
  const title = oneOrBoth(body.title, 8, 90);
  const summary = oneOrBoth(body.summary, 20, 220);
  const brief = oneOrBoth(body.brief, 60, 2400);
  const deliverable = oneOrBoth(body.deliverable, 10, 400);
  if (!title || !summary || !brief || !deliverable) return { ok: false, error: 'invalid_text' };
  const reward = typeof body.reward_lamports === 'number' && Number.isSafeInteger(body.reward_lamports) ? BigInt(body.reward_lamports) : null;
  if (reward === null || reward < WALLET_MIN_REWARD_LAMPORTS || reward > MAX_REWARD_LAMPORTS) return { ok: false, error: 'invalid_reward' };
  const unitId = text(body.unit_id, 36, 36);
  const minDays = body.min_days;
  if (!unitId || typeof minDays !== 'number' || !Number.isInteger(minDays) || minDays < 1 || minDays > 60) return { ok: false, error: 'invalid_requirement' };
  const days = body.expires_in_days;
  const claimHours = body.claim_hours ?? 48;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > WALLET_MAX_EXPIRY_DAYS) return { ok: false, error: 'invalid_deadline' };
  if (typeof claimHours !== 'number' || !Number.isInteger(claimHours) || claimHours < 1 || claimHours > WALLET_MAX_CLAIM_HOURS) return { ok: false, error: 'invalid_deadline' };
  const invitee = body.invitee_wallet === undefined || body.invitee_wallet === null || body.invitee_wallet === '' ? null : body.invitee_wallet;
  if (invitee !== null && !isEd25519Address(invitee)) return { ok: false, error: 'invalid_invitee' };
  if (invitee !== null && invitee === sponsorWallet) return { ok: false, error: 'own_invitee' };
  const prize = parsePrizeTera(body.prize_tera);
  if (!prize.ok) return { ok: false, error: prize.error };
  return {
    ok: true,
    value: {
      invitee_wallet: invitee as string | null,
      prize_tera: prize.value,
      sponsor_name: sponsor,
      title_i18n: title.texts,
      summary_i18n: summary.texts,
      brief_i18n: brief.texts,
      deliverable_i18n: deliverable.texts,
      reward_lamports: Number(reward),
      unit_id: unitId,
      min_days: minDays,
      claim_hours: claimHours,
      expires_at: new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString(),
      source_lang: title.source,
    },
  };
}

/** The learner's delivery: an https link and an optional note. */
export function parseSubmission(body: Record<string, unknown>): { url: string; note: string | null } | null {
  const raw = text(body.url, 8, 500);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !url.hostname.includes('.') || url.username || url.password) return null;
  const note = body.note === undefined || body.note === null || body.note === '' ? null : text(body.note, 1, 1000);
  if (body.note && note === null) return null;
  return { url: url.toString(), note };
}

/** The verdict of a bounty's mechanical check on the code a learner delivered. `null`: the bounty has no check, a person reviews it. */
export function judgeCode(bounty: Pick<BountyRow, 'auto_check'>, code: string, parseHtml: HtmlParser, now: Date): CheckReport | null {
  const check = bounty.auto_check;
  if (!check || check.checks.length === 0) return null;
  const results = staticCheckResults(check.checks, code, parseHtml);
  return { version: check.version, passed: results.every(Boolean), checks: check.checks.map((entry, index) => ({ id: entry.id, passed: results[index] })), checked_at: now.toISOString() };
}

/** The code a learner pastes as the delivery of a bounty judged by a check. */
export function parseCodeSubmission(body: Record<string, unknown>): string | null {
  const code = typeof body.code === 'string' ? body.code : '';
  return code.trim().length > 0 && code.length <= DELIVERY_CODE_MAX ? code : null;
}

function transferView(signature: string | null, lamports: number | null, at: string | null, wallet: string | null) {
  if (!signature && lamports === null) return null;
  return { signature, lamports, sol: lamports === null ? null : solAmount(lamports), at, wallet, explorer_url: explorerUrl('tx', signature) };
}

export function bountyPageUrl(slug: string): string {
  return `${APP_URL}/bounties/${slug}`;
}

export function bountyActionUrl(functionsBase: string, slug: string, lang?: Lang): string {
  return `${functionsBase}/bounty-action/${slug}${lang ? `?lang=${lang}` : ''}`;
}

/** The public funding link of a bounty: its Solana Action, and the same Action opened in a Blink client. */
export function fundingLinks(functionsBase: string, slug: string): { action_url: string; blink_url: string } {
  const actionUrl = bountyActionUrl(functionsBase, slug);
  return { action_url: actionUrl, blink_url: dialToUrl(actionUrl) };
}

/** What anyone may read about a bounty. No user id, no e-mail, no review note. */
export function bountyView(input: {
  bounty: BountyRow;
  claim: ClaimRow | null;
  events?: EventRow[];
  lang: Lang;
  now: Date;
  functionsBase: string;
  /** The escrow program's id, for bounties it holds. */
  programId?: string;
  /** The payout went to one of the team's own test accounts: a rehearsal, shown as one. */
  rehearsal?: boolean;
  /** The wallet that posted it belongs to one of the team's own test accounts: never shown as an outside sponsor. */
  teamTestSponsor?: boolean;
  /** A judge bounty shown as one card for several escrow accounts: how many are free, of how many live. */
  judgeSlots?: { open: number; total: number };
  /** A judge bounty held by someone: the slug of a free one of the same template. */
  judgeFreeSlug?: string | null;
}) {
  const { bounty, claim, lang } = input;
  const byWallet = bounty.origin === 'wallet' && bounty.sponsor_wallet !== null;
  const program = bounty.escrow_kind === 'program' ? (input.programId ?? null) : null;
  const status = publicStatus(bounty, input.now);
  const paid = bounty.status === 'paid';
  const invitee = bounty.invitee_wallet ?? null;
  return {
    id: bounty.id,
    /** Posted for one wallet. The escrow program refuses every other claimant; the board never lists it. */
    direct: invitee !== null,
    invitee_wallet: invitee,
    invitee_wallet_short: invitee ? shortWallet(invitee) : null,
    invitee_profile_url: invitee ? `${APP_URL}/u/${invitee}` : null,
    /** Who refuses a wallet that was not invited: the escrow program, at `accept`. `null`: not a direct bounty. */
    invite_enforced_by: invitee ? (bounty.escrow_kind === 'program' && bounty.escrow_gated ? ('program' as const) : ('server' as const)) : null,
    slug: lang === 'en' && bounty.slug_en ? bounty.slug_en : bounty.slug,
    slugs: { pt: bounty.slug, en: bounty.slug_en ?? bounty.slug },
    sponsor: bounty.sponsor_name,
    posted_by: {
      kind: bounty.origin,
      team_test: byWallet && input.teamTestSponsor === true,
      name: bounty.sponsor_name,
      wallet: byWallet ? bounty.sponsor_wallet : null,
      wallet_short: byWallet ? shortWallet(bounty.sponsor_wallet as string) : null,
      profile_url: byWallet ? `${APP_URL}/u/${bounty.sponsor_wallet}` : null,
    },
    /** Who signs the approval on chain: the sponsor's own wallet, or the Itera treasury key for the team's bounties. */
    approver: byWallet ? 'sponsor_wallet' : 'itera',
    rehearsal: input.rehearsal === true,
    /** Judged by a mechanical check and funded by the team: a delivery that passes is paid at once, with nobody reviewing it. */
    judge: bounty.auto_check
      ? {
          funded_by: 'team',
          approval: 'automatic_check',
          checks: bounty.auto_check.checks.map((check) => ({ id: check.id, label: pickText(check.label, lang) })),
          code_max: DELIVERY_CODE_MAX,
          // The same bounty exists as several escrow accounts, one per taker: how many are free now, and one of them when this one is held.
          ...(input.judgeSlots ? { open_count: input.judgeSlots.open, slot_count: input.judgeSlots.total } : {}),
          ...(input.judgeFreeSlug ? { free_slug: input.judgeFreeSlug } : {}),
        }
      : null,
    hidden: bounty.hidden_at !== null,
    written_in: bounty.source_lang,
    title: pickText(bounty.title_i18n, lang),
    summary: pickText(bounty.summary_i18n, lang),
    brief: pickText(bounty.brief_i18n, lang),
    deliverable: pickText(bounty.deliverable_i18n, lang),
    status,
    cluster: CLUSTER,
    reward_lamports: bounty.reward_lamports,
    reward_sol: solAmount(bounty.reward_lamports),
    requirement: {
      program: bounty.requirement.program,
      unit_id: bounty.requirement.unit_id,
      trail: pickText(bounty.requirement.trail_title, lang),
      min_days: bounty.requirement.min_days,
      total_days: bounty.requirement.total_days,
    },
    escrow: {
      kind: bounty.escrow_kind,
      custody: bounty.escrow_kind === 'program' ? 'program' : 'itera_server',
      address: bounty.escrow_address,
      explorer_url: explorerUrl('address', bounty.escrow_address),
      target_lamports: Number(bounty.escrow_kind === 'program' ? BigInt(bounty.reward_lamports) : fundingTarget(bounty.reward_lamports)),
      refund_address: bounty.refund_address,
      program_id: program,
      program_explorer_url: explorerUrl('address', program),
      /** Who checks the stamped days at accept: the program, reading the certification account, or Itera's attester co-signing. */
      days_checked_by: bounty.escrow_kind === 'program' && bounty.escrow_gated ? 'program' : 'attester',
    },
    claim_hours: bounty.claim_hours,
    expires_at: bounty.expires_at,
    created_at: bounty.created_at,
    claim: claim
      ? {
          wallet: claim.wallet,
          wallet_short: shortWallet(claim.wallet),
          profile_url: `${APP_URL}/u/${claim.wallet}`,
          status: claim.status,
          accepted_at: claim.accepted_at,
          deadline_at: claim.deadline_at,
          submitted_at: claim.submitted_at,
          proof_asset: claim.proof_asset,
          proof_url: `${APP_URL}/c/${claim.proof_asset}`,
          submission_url: paid ? (bounty.delivery_mirror_url ?? claim.submission_url) : null,
          submission_mirrored: paid && bounty.delivery_mirror_url !== null,
          submission_code: paid && bounty.auto_check ? claim.submission_code : null,
          check_report: paid && bounty.auto_check ? claim.check_report : null,
        }
      : null,
    /** A sponsor Tera minted, soulbound, to the wallet this bounty pays. `funded`: the funding transaction paid for it. */
    prize_tera: prizeView({ prize: prizeOf(bounty.prize_tera), functionsBase: input.functionsBase, issued: bounty.prize_issued ?? 0, funded: Boolean(bounty.prize_fee_signature), asset: bounty.prize_asset ?? null, rowId: null }),
    funding: transferView(bounty.funding_signature, bounty.funded_lamports, bounty.funded_at, null),
    payout: transferView(bounty.payout_signature, bounty.payout_lamports, bounty.paid_at, bounty.paid_wallet),
    refund: transferView(bounty.refund_signature, bounty.refund_lamports, bounty.refunded_at, bounty.refund_address),
    page_url: bountyPageUrl(lang === 'en' && bounty.slug_en ? bounty.slug_en : bounty.slug),
    /** The public funding link: any wallet may lock the reward through it. The sponsor, the approver and the refund address stay the ones above. */
    fund: fundingLinkVerdict(bounty, input.now) === 'ok' ? fundingLinks(input.functionsBase, bounty.slug) : null,
    ...(input.events
      ? {
          events: input.events.map((event) => ({
            kind: event.kind,
            wallet: event.wallet,
            lamports: event.lamports,
            sol: event.lamports === null ? null : solAmount(event.lamports),
            signature: event.signature,
            signed_by: event.signature ? (event.signer ?? null) : null,
            signed_role: signerRole(event, bounty),
            explorer_url: explorerUrl('tx', event.signature),
            at: event.created_at,
          })),
        }
      : {}),
  };
}

export type BountyView = ReturnType<typeof bountyView>;

/**
 * The numbers above the board, counted from the very rows the cards are drawn
 * from: a card that says PAID is in `paid_count`. `rehearsals`: bounties whose
 * payout went to one of the team's own test accounts. They are on chain and
 * counted, and the split says how many of the paid ones they are.
 */
export function boardStats(
  bounties: readonly BountyRow[],
  now: Date,
  rehearsals: ReadonlySet<string> = new Set(),
  teamTestSponsored: ReadonlySet<string> = new Set(),
  /** Judge bounties paid by the automatic check to wallets that are not the team's, counted apart from the rows above. */
  judged: { count: number; lamports: bigint; team_test_count?: number; team_test_lamports?: bigint } = { count: 0, lamports: 0n },
) {
  const judgeTests = { count: judged.team_test_count ?? 0, lamports: judged.team_test_lamports ?? 0n };
  let paid = 0n;
  let rehearsed = 0n;
  let locked = 0n;
  let paidCount = 0;
  let rehearsalCount = 0;
  let openCount = 0;
  let heldCount = 0;
  let outsideCount = 0;
  for (const bounty of bounties) {
    const status = publicStatus(bounty, now);
    if (status === 'paid') {
      const lamports = BigInt(bounty.payout_lamports ?? 0);
      paid += lamports;
      paidCount += 1;
      if (rehearsals.has(bounty.id)) {
        rehearsed += lamports;
        rehearsalCount += 1;
      }
    } else if (status === 'open' || status === 'claimed' || status === 'submitted' || status === 'paying') {
      locked += BigInt(bounty.funded_lamports ?? bounty.reward_lamports);
      if (status === 'open') openCount += 1;
      else heldCount += 1;
      if (bounty.origin === 'wallet' && !teamTestSponsored.has(bounty.id)) outsideCount += 1;
    }
  }
  return {
    // Every payout the escrow program made, whoever received it: the parts below add up to these.
    paid_lamports: Number(paid + judged.lamports + judgeTests.lamports),
    paid_sol: solAmount(paid + judged.lamports + judgeTests.lamports),
    paid_count: paidCount + judged.count + judgeTests.count,
    rehearsal_paid_count: rehearsalCount,
    rehearsal_paid_sol: solAmount(rehearsed),
    /** Approved by a person (the sponsor) and paid to a wallet that is not the team's. */
    outside_paid_count: paidCount - rehearsalCount,
    outside_paid_sol: solAmount(paid - rehearsed),
    /** Paid by the automatic check of a judge bounty to a wallet that is not the team's. */
    judge_paid_count: judged.count,
    judge_paid_sol: solAmount(judged.lamports),
    /** Judge bounties the team's own test wallets were paid for: runs of the same check, on chain like the others. */
    judge_team_test_paid_count: judgeTests.count,
    judge_team_test_paid_sol: solAmount(judgeTests.lamports),
    locked_lamports: Number(locked),
    locked_sol: solAmount(locked),
    open_count: openCount,
    held_count: heldCount,
    outside_sponsor_count: outsideCount,
  };
}

/**
 * The money of direct bounties, under its own figures: they are not on the
 * board (nobody is shown a bounty they cannot take) and not in `boardStats`,
 * and they are not left out of the count either. `teamTests`: the ones posted
 * by, or paid to, one of the team's own test accounts.
 */
export function directStats(bounties: readonly BountyRow[], now: Date, teamTests: ReadonlySet<string> = new Set()) {
  let locked = 0n;
  let paid = 0n;
  let open = 0;
  let held = 0;
  let paidCount = 0;
  let teamTestCount = 0;
  for (const bounty of bounties) {
    if (!bounty.invitee_wallet) continue;
    const status = publicStatus(bounty, now);
    const live = status === 'open' || status === 'claimed' || status === 'submitted' || status === 'paying';
    if (!live && status !== 'paid') continue;
    if (teamTests.has(bounty.id)) teamTestCount += 1;
    if (status === 'paid') {
      paid += BigInt(bounty.payout_lamports ?? 0);
      paidCount += 1;
      continue;
    }
    locked += BigInt(bounty.funded_lamports ?? bounty.reward_lamports);
    if (status === 'open') open += 1;
    else held += 1;
  }
  return {
    direct_open: open,
    direct_held: held,
    direct_locked_lamports: Number(locked),
    direct_locked_sol: solAmount(locked),
    direct_paid: paidCount,
    direct_paid_lamports: Number(paid),
    direct_paid_sol: solAmount(paid),
    /** Of the direct bounties counted above: how many the team's own test accounts posted or were paid for. */
    direct_team_test: teamTestCount,
  };
}

const LIVE_STATUSES: readonly string[] = ['open', 'claimed', 'submitted', 'paying'];

/**
 * Judge bounties of one template are the same task in several escrow accounts, one per taker. The board
 * lists one of them: a free one when there is one (the oldest), else the first held one. `slots` says, for
 * the listed one, how many are free of how many live. Other bounties pass through, order kept.
 */
export function collapseJudgeBounties(bounties: readonly BountyRow[], now: Date): { listed: BountyRow[]; slots: Map<string, { open: number; total: number }> } {
  const groups = new Map<string, BountyRow[]>();
  for (const bounty of bounties) {
    if (bounty.template_key && LIVE_STATUSES.includes(publicStatus(bounty, now))) groups.set(bounty.template_key, [...(groups.get(bounty.template_key) ?? []), bounty]);
  }
  const chosen = new Map<string, string>();
  const slots = new Map<string, { open: number; total: number }>();
  for (const [key, group] of groups) {
    const free = group.filter((bounty) => publicStatus(bounty, now) === 'open').sort((a, b) => a.created_at.localeCompare(b.created_at));
    const shown = free[0] ?? group[0];
    chosen.set(key, shown.id);
    slots.set(shown.id, { open: free.length, total: group.length });
  }
  const listed = bounties.filter((bounty) => !bounty.template_key || !groups.has(bounty.template_key) || chosen.get(bounty.template_key) === bounty.id || !LIVE_STATUSES.includes(publicStatus(bounty, now)));
  return { listed, slots };
}

/** What a wallet earned: the paid bounties whose payout went to it. `verified` is the chain's word on each payout. */
export function earningsView(input: { wallet: string; bounties: readonly BountyRow[]; landed: ReadonlySet<string>; lang: Lang }) {
  const items = input.bounties
    .filter((bounty) => bounty.status === 'paid' && bounty.paid_wallet === input.wallet && bounty.payout_signature)
    .map((bounty) => ({
      slug: bounty.slug,
      title: pickText(bounty.title_i18n, input.lang),
      sponsor: bounty.sponsor_name,
      lamports: bounty.payout_lamports ?? 0,
      sol: solAmount(bounty.payout_lamports ?? 0),
      paid_at: bounty.paid_at,
      signature: bounty.payout_signature,
      verified: input.landed.has(bounty.payout_signature as string),
      explorer_url: explorerUrl('tx', bounty.payout_signature),
      page_url: bountyPageUrl(bounty.slug),
    }));
  const verified = items.filter((item) => item.verified);
  const total = verified.reduce((sum, item) => sum + BigInt(item.lamports), 0n);
  return { wallet: input.wallet, cluster: CLUSTER, earned_lamports: Number(total), earned_sol: solAmount(total), bounties_paid: verified.length, items };
}

const ACTION_TEXT = {
  pt: {
    title: (name: string) => `Financie a missão: ${name}`,
    description: (sponsor: string, trail: string, days: number) =>
      `Missão paga da Itera (devnet), publicada por ${sponsor}. O valor fica travado numa conta de escrow própria desta missão e só sai para quem tem ${days} dia(s) carimbados de "${trail}" na certificação on-chain e entregar o trabalho aprovado. Sem entrega, volta para o patrocinador.`,
    directDescription: (sponsor: string, invitee: string) =>
      `Missão direta da Itera (devnet), publicada por ${sponsor} para uma única carteira convidada (${invitee}). O valor fica travado numa conta de escrow própria desta missão e o programa recusa qualquer outra carteira. Sem entrega, volta para o patrocinador.`,
    directDoneDescription: 'O valor está travado no escrow. Só a carteira convidada pode aceitar esta missão.',
    walletDescription: (sponsor: string, wallet: string, trail: string, days: number) =>
      `Missão paga da Itera (devnet), publicada por ${sponsor} com a carteira ${wallet}. O que você travar aqui fica na conta de escrow DESTA missão, e de nenhuma outra. Só sai para quem tem ${days} dia(s) carimbados de "${trail}" na certificação on-chain e entregar o trabalho, e só a carteira do patrocinador (${wallet}) pode aprovar a entrega. Se ninguém entregar, o valor volta para a carteira do PATROCINADOR (${wallet}), não para a carteira que financiou.`,
    walletDirectDescription: (sponsor: string, wallet: string, invitee: string) =>
      `Missão direta da Itera (devnet), publicada por ${sponsor} com a carteira ${wallet} para uma única carteira convidada: ${invitee}. O que você travar aqui fica na conta de escrow DESTA missão, e o programa recusa qualquer outra carteira que tente aceitá-la. Só a carteira do patrocinador (${wallet}) pode aprovar a entrega. Se ninguém entregar, o valor volta para a carteira do PATROCINADOR (${wallet}), não para a carteira que financiou.`,
    label: 'Financiar',
    button: (price: string) => `Travar ${price} no escrow`,
    message: (name: string) => `Escrow da missão: ${name}`,
    doneTitle: 'Missão financiada ✓',
    doneDescription: 'O valor está travado no escrow e a missão está aberta para quem tem a certificação.',
    doneLabel: 'Financiada',
    pendingDescription: 'A transação foi enviada. A missão abre assim que a rede confirmar o saldo do escrow.',
    errors: {
      not_found: 'Esta missão não existe.',
      not_fundable: 'Esta missão já está financiada ou foi encerrada.',
      invalid_account: 'A carteira que paga não é um endereço Solana válido.',
      insufficient_funds: 'Saldo insuficiente em devnet para travar o valor e pagar a taxa.',
      unavailable: 'A rede Solana (devnet) não respondeu. Tente de novo.',
      invalid_body: 'Pedido inválido.',
    },
  },
  en: {
    title: (name: string) => `Fund the bounty: ${name}`,
    description: (sponsor: string, trail: string, days: number) =>
      `A paid bounty at Itera (devnet), posted by ${sponsor}. The amount is locked in an escrow account of this bounty alone and only leaves to a wallet with ${days} stamped day(s) of "${trail}" in its on-chain certification that delivers approved work. With no delivery it returns to the sponsor.`,
    directDescription: (sponsor: string, invitee: string) =>
      `A direct bounty at Itera (devnet), posted by ${sponsor} for one invited wallet (${invitee}). The amount is locked in an escrow account of this bounty alone and the program refuses any other wallet. With no delivery it returns to the sponsor.`,
    directDoneDescription: 'The amount is locked in escrow. Only the invited wallet can accept this bounty.',
    walletDescription: (sponsor: string, wallet: string, trail: string, days: number) =>
      `A paid bounty at Itera (devnet), posted by ${sponsor} with the wallet ${wallet}. What you lock here is held in the escrow account of THIS bounty and no other. It only leaves to a wallet with ${days} stamped day(s) of "${trail}" in its on-chain certification that delivers the work, and only the sponsor's wallet (${wallet}) can approve the delivery. If nobody delivers, the reward returns to the SPONSOR's wallet (${wallet}), not to the wallet that funded it.`,
    walletDirectDescription: (sponsor: string, wallet: string, invitee: string) =>
      `A direct bounty at Itera (devnet), posted by ${sponsor} with the wallet ${wallet} for one invited wallet: ${invitee}. What you lock here is held in the escrow account of THIS bounty, and the program refuses any other wallet that tries to accept it. Only the sponsor's wallet (${wallet}) can approve the delivery. If nobody delivers, the reward returns to the SPONSOR's wallet (${wallet}), not to the wallet that funded it.`,
    label: 'Fund',
    button: (price: string) => `Lock ${price} in escrow`,
    message: (name: string) => `Bounty escrow: ${name}`,
    doneTitle: 'Bounty funded ✓',
    doneDescription: 'The amount is locked in escrow and the bounty is open to certified wallets.',
    doneLabel: 'Funded',
    pendingDescription: 'The transaction was sent. The bounty opens as soon as the network confirms the escrow balance.',
    errors: {
      not_found: 'This bounty does not exist.',
      not_fundable: 'This bounty is already funded or closed.',
      invalid_account: 'The paying wallet is not a valid Solana address.',
      insufficient_funds: 'Not enough devnet SOL to lock the amount and pay the fee.',
      unavailable: 'Solana (devnet) did not answer. Try again.',
      invalid_body: 'Invalid request.',
    },
  },
} as const;

export type BountyActionError = keyof (typeof ACTION_TEXT)['en']['errors'];

export function bountyActionError(code: BountyActionError, lang: Lang): { message: string } {
  return { message: ACTION_TEXT[lang].errors[code] };
}

export const BOUNTY_ACTION_ICON = `${APP_URL}/mascot/tera-happy.webp`;

/** What the funding link says before anyone signs. A bounty a wallet posted names that wallet in full: it approves, and the refund goes to it, whoever funds. */
function actionDescription(bounty: BountyRow, lang: Lang): string {
  const copy = ACTION_TEXT[lang];
  const trail = pickText(bounty.requirement.trail_title, lang);
  if (bounty.origin === 'wallet' && bounty.sponsor_wallet) {
    return bounty.invitee_wallet
      ? copy.walletDirectDescription(bounty.sponsor_name, bounty.sponsor_wallet, bounty.invitee_wallet)
      : copy.walletDescription(bounty.sponsor_name, bounty.sponsor_wallet, trail, bounty.requirement.min_days);
  }
  return bounty.invitee_wallet ? copy.directDescription(bounty.sponsor_name, shortWallet(bounty.invitee_wallet)) : copy.description(bounty.sponsor_name, trail, bounty.requirement.min_days);
}

export function bountyActionGet(input: { bounty: BountyRow; lang: Lang; missingLamports: bigint; href: string; blocked: BountyActionError | null }) {
  const copy = ACTION_TEXT[input.lang];
  const { bounty } = input;
  return {
    type: 'action' as const,
    icon: BOUNTY_ACTION_ICON,
    title: copy.title(pickText(bounty.title_i18n, input.lang)),
    description: actionDescription(bounty, input.lang),
    label: copy.label,
    ...(input.blocked ? { disabled: true, error: bountyActionError(input.blocked, input.lang) } : {}),
    links: { actions: [{ type: 'transaction' as const, label: copy.button(solAmount(input.missingLamports)), href: input.href }] },
  };
}

export function bountyActionPost(input: { bounty: BountyRow; lang: Lang; transactionBase64: string; callbackHref: string }) {
  return {
    type: 'transaction' as const,
    transaction: input.transactionBase64,
    message: ACTION_TEXT[input.lang].message(pickText(input.bounty.title_i18n, input.lang)),
    links: { next: { type: 'post' as const, href: input.callbackHref } },
  };
}

export function bountyActionCompleted(input: { lang: Lang; funded: boolean; direct?: boolean }) {
  const copy = ACTION_TEXT[input.lang];
  return {
    type: 'completed' as const,
    icon: BOUNTY_ACTION_ICON,
    title: copy.doneTitle,
    description: input.funded ? (input.direct ? copy.directDoneDescription : copy.doneDescription) : copy.pendingDescription,
    label: copy.doneLabel,
  };
}
