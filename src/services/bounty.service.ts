/** Bounties: the public board (`bounty-board`), the learner's side (`bounty-claim`) and the sponsor console (`bounty-sponsor`). */
<<<<<<< HEAD
import { parseSignOffer, signOffer } from '@/services/bountySign';
import { callShop } from '@/services/shopTransport';
=======
import { connectWallet, signAndSendPurchase, WalletSignError } from '@/services/walletSign';
import { callShop, ShopCallError } from '@/services/shopTransport';
import type { PurchaseIntent } from '@/types/shop';
>>>>>>> 18eab55 (Bounties UI: post a bounty from your wallet, sponsor console, labels for team and outside sponsors and rehearsals, held notice, deliver form that says what is wrong, plurals)
import type {
  ApproveResult,
  Bounty,
  BountyBoard,
  BountyClaim,
  BountyDetail,
  BountyLang,
  BountyMoney,
  BountyStatus,
  ConfirmResult,
  CreateBountyInput,
  CreatedBounty,
  CreatePostedInput,
  EligibilityReason,
  LedgerEvent,
  ModerationBounty,
  MyBountyStatus,
  PostedBounty,
  PostedList,
  PostedReview,
  PostLimits,
  PostOptions,
  PostedBy,
  SponsorBounty,
  SponsorList,
  SponsorReview,
  SponsorTrail,
  TxPhase,
  WalletTx,
  WalletTxKind,
} from '@/types/bounty';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(row) : []);
const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const STATUSES: readonly BountyStatus[] = ['awaiting_funding', 'open', 'claimed', 'submitted', 'paying', 'paid', 'refunding', 'refunded', 'expired'];
const REASONS: readonly EligibilityReason[] = ['no_wallet', 'no_certification', 'not_enough_days'];

function toMoney(v: unknown): BountyMoney | null {
  const r = row(v);
  const signature = text(r.signature);
  if (!signature) return null;
  return { signature, lamports: int(r.lamports) ?? 0, sol: text(r.sol) ?? '', at: text(r.at), wallet: text(r.wallet), explorerUrl: text(r.explorer_url) };
}

function toClaim(v: unknown): BountyClaim | null {
  const r = row(v);
  const wallet = text(r.wallet);
  if (!wallet) return null;
  return {
    wallet,
    walletShort: text(r.wallet_short) ?? wallet,
    profileUrl: text(r.profile_url),
    status: text(r.status) ?? '',
    acceptedAt: text(r.accepted_at),
    deadlineAt: text(r.deadline_at),
    submittedAt: text(r.submitted_at),
    proofAsset: text(r.proof_asset),
    proofUrl: text(r.proof_url),
    submissionUrl: text(r.submission_url),
    submissionMirrored: r.submission_mirrored === true,
  };
}

function toPostedBy(v: unknown, sponsor: string): PostedBy {
  const r = row(v);
  const wallet = text(r.wallet);
  return {
    kind: r.kind === 'wallet' ? 'wallet' : 'team',
    name: text(r.name) ?? sponsor,
    wallet,
    walletShort: text(r.wallet_short) ?? wallet,
    profileUrl: text(r.profile_url),
  };
}

const lang = (v: unknown): BountyLang | null => (v === 'pt' || v === 'en' ? v : null);

/** Null when the row lacks what the page cannot work without (id, slug, a known status). */
export function parseBounty(v: unknown): Bounty | null {
  const r = row(v);
  const id = text(r.id);
  const slug = text(r.slug);
  const status = STATUSES.find((s) => s === r.status);
  if (!id || !slug || !status) return null;
  const req = row(r.requirement);
  const escrow = row(r.escrow);
  const fund = row(r.fund);
  const slugs = row(r.slugs);
  const sponsor = text(r.sponsor) ?? '';
  return {
    id,
    slug,
    slugs: { pt: text(slugs.pt) ?? slug, en: text(slugs.en) ?? slug },
    postedBy: toPostedBy(r.posted_by, sponsor),
    approver: r.approver === 'sponsor_wallet' ? 'sponsor_wallet' : 'itera',
    rehearsal: r.rehearsal === true,
    hidden: r.hidden === true,
    writtenIn: lang(r.written_in),
    sponsor,
    title: text(r.title) ?? slug,
    summary: text(r.summary) ?? '',
    brief: text(r.brief) ?? '',
    deliverable: text(r.deliverable) ?? '',
    status,
    rewardLamports: int(r.reward_lamports) ?? 0,
    rewardSol: text(r.reward_sol) ?? '',
    requirement: {
      program: text(req.program) ?? '',
      unitId: text(req.unit_id) ?? '',
      trail: text(req.trail) ?? '',
      minDays: int(req.min_days) ?? 0,
      totalDays: int(req.total_days) ?? 0,
    },
    escrow: text(escrow.address)
      ? { address: String(escrow.address), explorerUrl: text(escrow.explorer_url), targetLamports: int(escrow.target_lamports) ?? 0, refundAddress: text(escrow.refund_address), custody: escrow.custody === 'program' ? 'program' : 'itera_server', programId: text(escrow.program_id), programExplorerUrl: text(escrow.program_explorer_url) }
      : null,
    claimHours: int(r.claim_hours) ?? 72,
    expiresAt: text(r.expires_at),
    createdAt: text(r.created_at),
    claim: toClaim(r.claim),
    funding: toMoney(r.funding),
    payout: toMoney(r.payout),
    refund: toMoney(r.refund),
    fundBlinkUrl: text(fund.blink_url),
  };
}

const parseBounties = (v: unknown): Bounty[] => (Array.isArray(v) ? v.map(parseBounty).filter((b): b is Bounty => b !== null) : []);

export function parseBoard(body: unknown): BountyBoard {
  const b = row(body);
  const s = row(b.stats);
  return {
    stats: {
      paidSol: text(s.paid_sol) ?? '0 SOL',
      lockedSol: text(s.locked_sol) ?? '0 SOL',
      paidCount: int(s.paid_count) ?? 0,
      openCount: int(s.open_count) ?? 0,
      rehearsalPaidCount: int(s.rehearsal_paid_count) ?? 0,
      rehearsalPaidSol: text(s.rehearsal_paid_sol) ?? '0 SOL',
      outsidePaidCount: int(s.outside_paid_count) ?? 0,
      outsidePaidSol: text(s.outside_paid_sol) ?? '0 SOL',
      heldCount: int(s.held_count) ?? 0,
      outsideSponsorCount: int(s.outside_sponsor_count) ?? 0,
    },
    readAt: text(b.read_at),
    bounties: parseBounties(b.bounties),
  };
}

function toEvent(r: Row): LedgerEvent {
  return {
    kind: text(r.kind) ?? '',
    wallet: text(r.wallet),
    lamports: int(r.lamports),
    sol: text(r.sol),
    signature: text(r.signature),
    signedBy: text(r.signed_by),
    explorerUrl: text(r.explorer_url),
    at: text(r.at),
  };
}

export function parseDetail(body: unknown): BountyDetail | null {
  const bounty = parseBounty(body);
  if (!bounty) return null;
  return { ...bounty, events: rows(row(body).events).filter((e) => text(e.kind)).map(toEvent) };
}

export function parseMyStatus(body: unknown): MyBountyStatus {
  const b = row(body);
  const proof = row(b.proof);
  const claim = row(b.claim);
  const reason = REASONS.find((x) => x === b.reason) ?? null;
  return {
    wallet: text(b.wallet),
    eligible: b.eligible === true,
    reason,
    proof: text(proof.asset) ? { asset: String(proof.asset), daysDone: int(proof.days_done) ?? 0, explorerUrl: text(proof.explorer_url) } : null,
    claim: text(claim.bounty_id)
      ? {
          bountyId: String(claim.bounty_id),
          status: text(claim.status) ?? '',
          acceptedAt: text(claim.accepted_at),
          deadlineAt: text(claim.deadline_at),
          submissionUrl: text(claim.submission_url),
          submissionNote: text(claim.submission_note),
          submittedAt: text(claim.submitted_at),
          reviewNote: text(claim.review_note),
        }
      : null,
    busyElsewhere: b.busy_elsewhere === true,
  };
}

function toReview(v: unknown): SponsorReview | null {
  const r = row(v);
  if (!text(r.status)) return null;
  return {
    status: String(r.status),
    wallet: text(r.wallet),
    submissionUrl: text(r.submission_url),
    submissionNote: text(r.submission_note),
    submittedAt: text(r.submitted_at),
    proofDays: int(row(r.proof).days_done),
  };
}

export function parseSponsorList(body: unknown): SponsorList {
  const b = row(body);
  const bounties: SponsorBounty[] = [];
  for (const r of rows(b.bounties)) {
    const base = parseBounty(r);
    if (!base) continue;
    const i18n = row(r.title_i18n);
    bounties.push({
      ...base,
      titleI18n: { pt: text(i18n.pt) ?? base.title, en: text(i18n.en) ?? base.title },
      treasuryFundable: r.treasury_fundable === true,
      review: toReview(r.review),
    });
  }
  return {
    trails: toTrails(b.trails),
    bounties,
  };
}

function toTrails(v: unknown): SponsorTrail[] {
  return rows(v)
    .filter((r) => text(r.unit_id))
    .map((r) => {
      const title = row(r.title);
      return { unitId: String(r.unit_id), title: { pt: text(title.pt) ?? '', en: text(title.en) ?? text(title.pt) ?? '' }, totalDays: int(r.total_days) ?? 0 };
    });
}

export function parsePostOptions(body: unknown): PostOptions {
  const b = row(body);
  const l = row(b.limits);
  const limits: PostLimits = {
    minRewardLamports: int(l.min_reward_lamports) ?? 0,
    maxRewardLamports: int(l.max_reward_lamports) ?? 0,
    escrowRentLamports: int(l.escrow_rent_lamports),
    feeLamports: int(l.fee_lamports) ?? 0,
    postsPerDay: int(l.posts_per_day) ?? 0,
    liveBounties: int(l.live_bounties) ?? 0,
    maxExpiryDays: int(l.max_expiry_days) ?? 30,
    maxClaimHours: int(l.max_claim_hours) ?? 168,
  };
  return { cluster: text(b.cluster) ?? 'devnet', programId: text(b.program_id), trails: toTrails(b.trails), limits };
}

function toPostedReview(v: unknown): PostedReview | null {
  const r = row(v);
  if (!text(r.status)) return null;
  return {
    status: String(r.status),
    wallet: text(r.wallet),
    submissionUrl: text(r.submission_url),
    submissionNote: text(r.submission_note),
    submittedAt: text(r.submitted_at),
    proofDays: int(row(r.proof).days_done),
    proofAsset: text(r.proof_asset),
  };
}

export function parsePostedList(body: unknown): PostedList {
  const b = row(body);
  const bounties: PostedBounty[] = [];
  for (const r of rows(b.bounties)) {
    const base = parseBounty(r);
    if (base) bounties.push({ ...base, hiddenReason: text(r.hidden_reason), review: toPostedReview(r.review) });
  }
  return { wallet: text(b.wallet) ?? '', balanceLamports: int(b.balance_lamports), bounties };
}

export function parseWalletTx(body: unknown): WalletTx | null {
  const b = row(body);
  const payer = text(b.payer);
  const messageBase58 = text(b.message_base58);
  const kind = b.kind === 'fund' || b.kind === 'approve' || b.kind === 'refund' ? b.kind : null;
  if (!payer || !messageBase58 || !kind) return null;
  return {
    kind,
    payer,
    messageBase58,
    messageBase64: text(b.message_base64) ?? '',
    transactionBase58: text(b.transaction_base58) ?? '',
    transactionBase64: text(b.transaction_base64) ?? '',
    costLamports: int(b.cost_lamports) ?? 0,
    rentLamports: int(b.rent_lamports) ?? 0,
    escrow: text(b.escrow),
    pays: text(b.pays),
    lamports: int(b.lamports),
  };
}

export function parseConfirm(body: unknown): ConfirmResult {
  const b = row(body);
  return {
    status: text(b.status) ?? '',
    changed: b.changed === true,
    payoutSignature: text(b.payout_signature),
    refundSignature: text(b.refund_signature),
    fundingSignature: text(b.funding_signature),
  };
}

export function parseModeration(body: unknown): ModerationBounty[] {
  return rows(row(body).bounties)
    .filter((r) => text(r.id))
    .map((r) => {
      const title = row(r.title_i18n);
      const slug = text(r.slug) ?? '';
      return {
        id: String(r.id),
        slug,
        sponsorName: text(r.sponsor_name) ?? '',
        sponsorWallet: text(r.sponsor_wallet),
        title: text(title.en) ?? text(title.pt) ?? slug,
        status: text(r.status) ?? '',
        rewardLamports: int(r.reward_lamports) ?? 0,
        hiddenAt: text(r.hidden_at),
        hiddenReason: text(r.hidden_reason),
        createdAt: text(r.created_at),
        reports: rows(r.bounty_reports).map((x) => ({ reason: text(x.reason) ?? '', createdAt: text(x.created_at) })),
      };
    });
}

export function parseApprove(body: unknown): ApproveResult {
  const b = row(body);
  return { outcome: b.outcome === 'settled' ? 'settled' : 'pending', status: text(b.status) ?? '', signature: text(b.payout_signature) };
}

/** The refusal code of a call (`not_open`, `forbidden`, `slug_taken`...), or null when the failure carried none. */
export function bountyErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
}

async function publicGet(path: string, lang: string): Promise<Response> {
  if (!url || !anonKey) throw new Error('Supabase not configured.');
  return fetch(`${url}/functions/v1/bounty-board${path}?lang=${lang}`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
}

export async function getBountyBoard(lang: string): Promise<BountyBoard> {
  const res = await publicGet('', lang);
  if (!res.ok) throw new Error(`bounty-board failed (${res.status})`);
  return parseBoard(await res.json());
}

/** Null for a slug that does not exist. */
export async function getBounty(slug: string, lang: string): Promise<BountyDetail | null> {
  const res = await publicGet(`/${encodeURIComponent(slug)}`, lang);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`bounty-board failed (${res.status})`);
  const detail = parseDetail(await res.json());
  if (!detail) throw new Error('bounty-board: unreadable bounty');
  return detail;
}

const claimCall = (action: string, bounty: string, extra: Record<string, unknown> = {}) => callShop('bounty-claim', { body: { action, bounty, ...extra } });

export async function getMyBountyStatus(bounty: string): Promise<MyBountyStatus> {
  return parseMyStatus((await claimCall('status', bounty)).data);
}

/**
 * One step the learner's own wallet signs: the backend answers the transaction (`*_prepare`), the wallet
 * signs it (it pays nothing: the fee payer is Itera's treasury), and the backend sends it (`*_submit`).
 * A bounty with nothing on chain to sign (`sign: null`) goes straight to the second call.
 */
async function signedStep(step: 'accept' | 'withdraw', bounty: string): Promise<void> {
  const prepared = (await claimCall(`${step}_prepare`, bounty)).data as { sign?: unknown } | null;
  const offer = parseSignOffer(prepared?.sign);
  if (prepared?.sign && !offer) throw new Error('bounty-claim: unreadable transaction');
  await claimCall(`${step}_submit`, bounty, offer ? { ...(await signOffer(offer)) } : {});
}

export async function acceptBounty(bounty: string): Promise<void> {
  await signedStep('accept', bounty);
}

export async function submitBounty(bounty: string, submissionUrl: string, note: string): Promise<void> {
  await claimCall('submit', bounty, note.trim() ? { url: submissionUrl, note: note.trim() } : { url: submissionUrl });
}

export async function withdrawBounty(bounty: string): Promise<void> {
  await signedStep('withdraw', bounty);
}

const sponsorCall = (body: Record<string, unknown>) => callShop('bounty-sponsor', { body });

export async function getSponsorList(): Promise<SponsorList> {
  return parseSponsorList((await sponsorCall({ action: 'list' })).data);
}

export async function createBounty(input: CreateBountyInput): Promise<{ slug: string }> {
  const body: Record<string, unknown> = {
    action: 'create',
    slug: input.slug,
    sponsor_name: input.sponsorName,
    title: input.title,
    summary: input.summary,
    brief: input.brief,
    deliverable: input.deliverable,
    reward_lamports: input.rewardLamports,
    unit_id: input.unitId,
    min_days: input.minDays,
    expires_in_days: input.expiresInDays,
    claim_hours: input.claimHours,
  };
  if (input.refundAddress.trim()) body.refund_address = input.refundAddress.trim();
  const { data } = await sponsorCall(body);
  return { slug: text(row(data).slug) ?? input.slug };
}

export async function fundBounty(bounty: string): Promise<void> {
  await sponsorCall({ action: 'fund', bounty });
}

export async function refreshBounty(bounty: string): Promise<string | null> {
  return text(row((await sponsorCall({ action: 'refresh', bounty })).data).status);
}

export async function approveBounty(bounty: string, note: string): Promise<ApproveResult> {
  return parseApprove((await sponsorCall(note.trim() ? { action: 'approve', bounty, note: note.trim() } : { action: 'approve', bounty })).data);
}

export async function rejectBounty(bounty: string, note: string): Promise<void> {
  await sponsorCall(note.trim() ? { action: 'reject', bounty, note: note.trim() } : { action: 'reject', bounty });
}

export async function refundBounty(bounty: string): Promise<void> {
  await sponsorCall({ action: 'refund', bounty });
}

export async function getPostOptions(): Promise<PostOptions> {
  if (!url || !anonKey) throw new Error('Supabase not configured.');
  const res = await fetch(`${url}/functions/v1/bounty-post`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
  if (!res.ok) throw new Error(`bounty-post failed (${res.status})`);
  return parsePostOptions(await res.json());
}

const postCall = (body: Record<string, unknown>) => callShop('bounty-post', { body });

export async function getPostedList(): Promise<PostedList> {
  return parsePostedList((await postCall({ action: 'list' })).data);
}

const onlyFilled = (value: Partial<Record<BountyLang, string>>): Partial<Record<BountyLang, string>> => {
  const out: Partial<Record<BountyLang, string>> = {};
  for (const l of ['pt', 'en'] as const) {
    const v = value[l]?.trim();
    if (v) out[l] = v;
  }
  return out;
};

export async function createPostedBounty(input: CreatePostedInput): Promise<CreatedBounty> {
  const { data } = await postCall({
    action: 'create',
    sponsor_name: input.sponsorName.trim(),
    title: onlyFilled(input.title),
    summary: onlyFilled(input.summary),
    brief: onlyFilled(input.brief),
    deliverable: onlyFilled(input.deliverable),
    reward_lamports: input.rewardLamports,
    unit_id: input.unitId,
    min_days: input.minDays,
    expires_in_days: input.expiresInDays,
    claim_hours: input.claimHours,
  });
  const r = row(data);
  const id = text(r.id);
  const slug = text(r.slug);
  if (!id || !slug) throw new Error('bounty-post: unreadable create answer');
  return { id, slug };
}

export async function requestWalletTx(kind: WalletTxKind, bounty: string): Promise<WalletTx> {
  const tx = parseWalletTx((await postCall({ action: `${kind}_tx`, bounty })).data);
  if (!tx) throw new Error('bounty-post: unreadable transaction');
  return tx;
}

export class BountyTxError extends Error {
  constructor(
    readonly code: 'wrong_wallet' | 'still_confirming' | 'no_wallet_address',
    readonly payer: string | null = null
  ) {
    super(code);
  }
}

const CONFIRM_TRIES = 3;

function intentOf(bounty: string, tx: WalletTx): PurchaseIntent {
  return {
    intentId: bounty,
    messageBase58: tx.messageBase58,
    messageBase64: tx.messageBase64,
    transactionBase58: tx.transactionBase58,
    transactionBase64: tx.transactionBase64,
    priceLamports: 0,
    priceUsdCents: 0,
    priceLabel: '',
    expiresAt: null,
    cluster: '',
    payer: tx.payer,
  };
}

async function confirmCall(bounty: string, note: string): Promise<ConfirmResult> {
  return parseConfirm((await postCall(note.trim() ? { action: 'confirm', bounty, note: note.trim() } : { action: 'confirm', bounty })).data);
}

export async function confirmUntilChanged(bounty: string, note: string): Promise<ConfirmResult> {
  let result = await confirmCall(bounty, note);
  for (let attempt = 1; !result.changed && attempt < CONFIRM_TRIES; attempt += 1) result = await confirmCall(bounty, note);
  if (!result.changed) throw new BountyTxError('still_confirming');
  return result;
}

export async function runBountyWalletTx(kind: WalletTxKind, bounty: string, note: string, onPhase: (phase: TxPhase) => void): Promise<ConfirmResult> {
  onPhase('preparing');
  const tx = await requestWalletTx(kind, bounty);
  const connected = await connectWallet();
  if (!connected) throw new BountyTxError('no_wallet_address');
  if (connected !== tx.payer) throw new BountyTxError('wrong_wallet', tx.payer);
  onPhase('wallet');
  const signed = await signAndSendPurchase(intentOf(bounty, tx));
  onPhase('confirming');
  if (signed.kind === 'signed') await postCall({ action: 'submit', bounty, signed_transaction: signed.signedTransaction });
  return confirmUntilChanged(bounty, note);
}

export async function rejectPosted(bounty: string, note: string): Promise<void> {
  await postCall(note.trim() ? { action: 'reject', bounty, note: note.trim() } : { action: 'reject', bounty });
}

export async function reportBounty(bounty: string, reason: string): Promise<void> {
  await postCall({ action: 'report', bounty, reason: reason.trim() });
}

export interface TxErrorInfo {
  key: string;
  vars: Record<string, string | number>;
  faucet: boolean;
}

const TX_CODES = ['insufficient_funds', 'not_fundable', 'already_funded', 'not_submitted', 'chain_mismatch', 'already_paid', 'self_review', 'not_refundable', 'already_refunded', 'broadcast_failed', 'too_many_today', 'too_many_live', 'no_wallet'];

const solText = (lamports: number): string => {
  const whole = Math.floor(lamports / 1_000_000_000);
  const fraction = String(lamports % 1_000_000_000).padStart(9, '0').replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''}`;
};

export function describeTxError(error: unknown): TxErrorInfo {
  if (error instanceof BountyTxError) return { key: `bounty.tx.err.${error.code}`, vars: { wallet: error.payer ?? '' }, faucet: false };
  if (error instanceof WalletSignError) return { key: `bounty.tx.err.wallet.${error.reason}`, vars: { detail: error.detail }, faucet: error.reason === 'insufficient' };
  const code = bountyErrorCode(error);
  if (code === 'insufficient_funds' && error instanceof ShopCallError) {
    const need = int(error.body?.required_lamports);
    const have = int(error.body?.balance_lamports);
    return { key: 'bounty.tx.err.insufficient_funds', vars: { need: need === null ? '?' : solText(need), have: have === null ? '?' : solText(have) }, faucet: true };
  }
  if (code && TX_CODES.includes(code)) return { key: `bounty.tx.err.${code}`, vars: { detail: error instanceof ShopCallError ? (error.detail ?? '') : '' }, faucet: false };
  return { key: 'bounty.err.generic', vars: {}, faucet: false };
}

export async function getModeration(): Promise<ModerationBounty[]> {
  return parseModeration((await sponsorCall({ action: 'moderation' })).data);
}

export async function setBountyHidden(bounty: string, hidden: boolean, reason: string): Promise<void> {
  await sponsorCall(hidden ? (reason.trim() ? { action: 'hide', bounty, reason: reason.trim() } : { action: 'hide', bounty }) : { action: 'unhide', bounty });
}
