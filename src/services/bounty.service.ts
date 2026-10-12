/** Bounties: the public board (`bounty-board`), the learner's side (`bounty-claim`) and the sponsor console (`bounty-sponsor`). */
import { parseSignOffer, signOffer } from '@/services/bountySign';
import { connectWallet, signAndSendPurchase, WalletSignError } from '@/services/walletSign';
import { callShop, ShopCallError } from '@/services/shopTransport';
import { takePreload } from '@/services/learnerProfile.service';
import type { PurchaseIntent } from '@/types/shop';
import { safeHttpsUrl } from '@/utils/bounty';
import type {
  ApproveResult,
  Bounty,
  BountyBoard,
  BountyClaim,
  BountyDetail,
  CheckReport,
  JudgeInfo,
  JudgeSummary,
  BountyLang,
  BountyMoney,
  BountyStatus,
  ConfirmResult,
  CreateBountyInput,
  CreatedBounty,
  CreatePostedInput,
  EligibilityReason,
  InviteeCheck,
  InviteeReason,
  InvitedInbox,
  LedgerEvent,
  ModerationBounty,
  MyBountyStatus,
  PostedBounty,
  PostedList,
  PostedReview,
  PostLimits,
  PostOptions,
  PrizeTera,
  PrizeTeraOptions,
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
const REASONS: readonly EligibilityReason[] = ['no_wallet', 'no_certification', 'not_enough_days', 'not_invited'];
const INVITEE_REASONS: readonly InviteeReason[] = ['no_certification', 'not_enough_days'];

function toMoney(v: unknown): BountyMoney | null {
  const r = row(v);
  const signature = text(r.signature);
  if (!signature) return null;
  return { signature, lamports: int(r.lamports) ?? 0, sol: text(r.sol) ?? '', at: text(r.at), wallet: text(r.wallet), explorerUrl: text(r.explorer_url) };
}

export function toCheckReport(v: unknown): CheckReport | null {
  const r = row(v);
  if (!Array.isArray(r.checks)) return null;
  return {
    version: int(r.version) ?? 0,
    passed: r.passed === true,
    checks: rows(r.checks).filter((c) => text(c.id)).map((c) => ({ id: String(c.id), passed: c.passed === true })),
    checkedAt: text(r.checked_at),
  };
}

function toJudge(v: unknown): JudgeInfo | null {
  const r = row(v);
  if (r.approval !== 'automatic_check') return null;
  return { checks: rows(r.checks).filter((c) => text(c.id)).map((c) => ({ id: String(c.id), label: text(c.label) ?? String(c.id) })), codeMax: int(r.code_max) ?? 8000, openCount: int(r.open_count), slotCount: int(r.slot_count), freeSlug: text(r.free_slug) };
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
    submissionCode: text(r.submission_code),
    checkReport: toCheckReport(r.check_report),
  };
}

function toPostedBy(v: unknown, sponsor: string): PostedBy {
  const r = row(v);
  const wallet = text(r.wallet);
  return {
    kind: r.kind === 'wallet' ? 'wallet' : 'team',
    teamTest: r.team_test === true,
    name: text(r.name) ?? sponsor,
    wallet,
    walletShort: text(r.wallet_short) ?? wallet,
    profileUrl: text(r.profile_url),
  };
}

const lang = (v: unknown): BountyLang | null => (v === 'pt' || v === 'en' ? v : null);

/** Null when the row lacks what the page cannot work without (id, slug, a known status). */
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

/** Null for a bounty with no prize, or a prize block that cannot be drawn safely (no brand, a colour that is not a hex). */
export function parsePrizeTera(v: unknown): PrizeTera | null {
  const r = row(v);
  const brand = text(r.brand);
  const accent = text(r.accent);
  if (!brand || !accent || !HEX_COLOUR.test(accent)) return null;
  return {
    brand,
    accent,
    base: text(r.base) ?? '',
    imageUrl: safeHttpsUrl(text(r.image_url)),
    funded: r.funded === true,
    asset: text(r.asset),
    mintLamports: int(r.mint_lamports) ?? 0,
    feeLamports: int(r.fee_lamports) ?? 0,
    totalLamports: int(r.total_lamports) ?? 0,
  };
}

export function parsePrizeOptions(v: unknown): PrizeTeraOptions | null {
  const r = row(v);
  const bases = rows(r.bases)
    .filter((b) => text(b.key) && safeHttpsUrl(text(b.image_url)))
    .map((b) => ({ key: String(b.key), title: text(b.title) ?? String(b.key), imageUrl: String(b.image_url), thumbUrl: safeHttpsUrl(text(b.thumb_url)) ?? String(b.image_url) }));
  if (r.enabled !== true || bases.length === 0) return null;
  return {
    enabled: true,
    bases,
    mintLamports: int(r.mint_lamports) ?? 0,
    feeLamports: int(r.fee_lamports) ?? 0,
    totalLamports: int(r.total_lamports) ?? (int(r.mint_lamports) ?? 0) + (int(r.fee_lamports) ?? 0),
    brandMin: int(r.brand_min_length) ?? 2,
    brandMax: int(r.brand_max_length) ?? 24,
    previewUrl: safeHttpsUrl(text(r.preview_url)),
  };
}

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
    judge: toJudge(r.judge),
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
      ? { address: String(escrow.address), explorerUrl: text(escrow.explorer_url), targetLamports: int(escrow.target_lamports) ?? 0, refundAddress: text(escrow.refund_address), custody: escrow.custody === 'program' ? 'program' : 'itera_server', programId: text(escrow.program_id), programExplorerUrl: text(escrow.program_explorer_url), daysCheckedBy: escrow.days_checked_by === 'program' ? 'program' : 'attester' }
      : null,
    claimHours: int(r.claim_hours) ?? 72,
    expiresAt: text(r.expires_at),
    createdAt: text(r.created_at),
    claim: toClaim(r.claim),
    funding: toMoney(r.funding),
    payout: toMoney(r.payout),
    refund: toMoney(r.refund),
    fundActionUrl: safeHttpsUrl(text(fund.action_url)),
    fundBlinkUrl: safeHttpsUrl(text(fund.blink_url)),
    direct: r.direct === true && Boolean(text(r.invitee_wallet)),
    inviteeWallet: text(r.invitee_wallet),
    inviteeWalletShort: text(r.invitee_wallet_short) ?? text(r.invitee_wallet),
    inviteeProfileUrl: text(r.invitee_profile_url),
    prizeTera: parsePrizeTera(r.prize_tera),
  };
}

const parseBounties = (v: unknown): Bounty[] => (Array.isArray(v) ? v.map(parseBounty).filter((b): b is Bounty => b !== null) : []);

function toJudgeSummary(v: unknown): JudgeSummary {
  const r = row(v);
  return {
    paidCount: int(r.paid_count) ?? 0,
    teamTestPaidCount: int(r.team_test_paid_count) ?? 0,
    latest: rows(r.latest)
      .filter((p) => text(p.slug))
      .map((p) => ({ slug: String(p.slug), paidAt: text(p.paid_at), wallet: text(p.wallet), walletShort: text(p.wallet_short) ?? text(p.wallet) ?? '', teamTest: p.team_test === true, explorerUrl: text(p.explorer_url) })),
  };
}

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
      hiddenTestCount: int(s.hidden_test_count),
      listedCount: int(s.listed_count),
      judgePaidCount: int(s.judge_paid_count) ?? 0,
      judgePaidSol: text(s.judge_paid_sol) ?? '0 SOL',
      judgeTeamTestPaidCount: int(s.judge_team_test_paid_count) ?? 0,
      openOnChainCount: int(s.open_on_chain_count),
      daysByProgramCount: int(s.days_by_program_count),
      daysByAttesterCount: int(s.days_by_attester_count),
    },
    judge: toJudgeSummary(b.judge),
    readAt: text(b.read_at),
    bounties: parseBounties(b.bounties),
  };
}

const SIGNED_ROLES = ['learner', 'sponsor', 'funder', 'itera_treasury', 'itera_key'] as const;

function toSignedRole(value: unknown): LedgerEvent['signedRole'] {
  return (SIGNED_ROLES as readonly unknown[]).includes(value) ? (value as LedgerEvent['signedRole']) : null;
}

function toEvent(r: Row): LedgerEvent {
  return {
    kind: text(r.kind) ?? '',
    wallet: text(r.wallet),
    lamports: int(r.lamports),
    sol: text(r.sol),
    signature: text(r.signature),
    signedBy: text(r.signed_by),
    signedRole: toSignedRole(r.signed_role),
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
          checkReport: toCheckReport(claim.check_report),
        }
      : null,
    busyElsewhere: b.busy_elsewhere === true,
    judgedBefore: b.judged_before === true,
    notInvited: b.reason === 'not_invited' || b.error === 'not_invited',
    inviteeWallet: text(b.invitee_wallet),
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
    staff: b.staff !== false,
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
    directEscrowRentLamports: int(l.direct_escrow_rent_lamports),
  };
  return { cluster: text(b.cluster) ?? 'devnet', programId: text(b.program_id), trails: toTrails(b.trails), limits, prizeTera: parsePrizeOptions(b.prize_tera) };
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
    linkCheck: toLinkCheck(r.link_check),
  };
}

const LINK_VERDICTS = ['opens', 'not_found', 'unconfirmed'] as const;

function toLinkCheck(v: unknown): PostedReview['linkCheck'] {
  const r = row(v);
  const verdict = LINK_VERDICTS.find((x) => x === r.verdict);
  return verdict ? { verdict, status: int(r.status) } : null;
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
    prizeLamports: int(row(b.prize_tera).total_lamports) ?? 0,
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
  const live = () => fetch(`${url}/functions/v1/bounty-board${path}?lang=${lang}`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
  // index.html asks for the board (/, /bounties) or the bounty (/bounties/<slug>) before the bundle loads; the answer is used once.
  return (takePreload('__iteraBoard', path.replace(/^\//, ''), lang) ?? live()).catch(live);
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

/** The bounty as Itera's tables hold it, asked without waiting on the Solana node: painted first, replaced by `getBounty`. */
export async function getBountyRecord(slug: string, lang: string): Promise<BountyDetail | null> {
  if (!url || !anonKey) throw new Error('Supabase not configured.');
  const live = () => fetch(`${url}/functions/v1/bounty-board/${encodeURIComponent(slug)}?lang=${lang}&read=record`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
  const res = await (takePreload('__iteraBounty', slug, lang) ?? live()).catch(live);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`bounty-board failed (${res.status})`);
  return parseDetail(await res.json());
}

const claimCall = (action: string, bounty: string, extra: Record<string, unknown> = {}) => callShop('bounty-claim', { body: { action, bounty, ...extra } });

export async function getMyBountyStatus(bounty: string): Promise<MyBountyStatus> {
  try {
    return parseMyStatus((await claimCall('status', bounty)).data);
  } catch (error) {
    // A direct bounty answers 403 not_invited with the whole status in the body: that is a state, not a failure.
    if (error instanceof ShopCallError && error.code === 'not_invited' && error.body) return parseMyStatus({ ...error.body, reason: 'not_invited' });
    throw error;
  }
}

/**
 * One step the learner's own wallet signs: the backend answers the transaction (`*_prepare`), the wallet
 * signs it (it pays nothing: the fee payer is Itera's treasury), and the backend sends it (`*_submit`).
 * A bounty with nothing on chain to sign (`sign: null`) goes straight to the second call.
 */
export type StepPhase = 'wallet' | 'confirming' | 'settling';

export interface SignedStepResult {
  explorerUrl: string | null;
}

async function signedStep(step: 'accept' | 'withdraw', bounty: string, onPhase: (phase: StepPhase) => void = () => undefined): Promise<SignedStepResult> {
  const prepared = (await claimCall(`${step}_prepare`, bounty)).data as { sign?: unknown } | null;
  const offer = parseSignOffer(prepared?.sign);
  if (prepared?.sign && !offer) throw new Error('bounty-claim: unreadable transaction');
  let extra: Record<string, unknown> = {};
  if (offer) {
    onPhase('wallet');
    extra = { ...(await signOffer(offer)) };
  }
  onPhase('confirming');
  const submitted = await claimCall(`${step}_submit`, bounty, extra);
  return { explorerUrl: text(row(row(submitted.data).chain).explorer_url) };
}

export const acceptBounty = (bounty: string, onPhase?: (phase: StepPhase) => void): Promise<SignedStepResult> => signedStep('accept', bounty, onPhase);

export async function submitBounty(bounty: string, submissionUrl: string, note: string): Promise<void> {
  await claimCall('submit', bounty, note.trim() ? { url: submissionUrl, note: note.trim() } : { url: submissionUrl });
}

export type JudgeResult =
  | { submitted: false; report: CheckReport | null }
  | { submitted: true; report: CheckReport | null; payout: { status: string; signature: string | null; explorerUrl: string | null; lamports: number | null } };

export function parseJudgeResult(body: unknown): JudgeResult {
  const b = row(body);
  const report = toCheckReport(b.report);
  if (b.submitted !== true) return { submitted: false, report };
  const payout = row(b.payout);
  return { submitted: true, report, payout: { status: text(payout.status) ?? '', signature: text(payout.signature), explorerUrl: text(payout.explorer_url), lamports: int(payout.lamports) } };
}

export async function submitJudgeCode(bounty: string, code: string): Promise<JudgeResult> {
  return parseJudgeResult((await claimCall('submit', bounty, { code })).data);
}

export type SponsorFaucetResult = { kind: 'sent'; signature: string; explorerUrl: string | null; lamports: number | null } | { kind: 'blocked'; reason: 'already_claimed' | 'not_needed' | 'no_wallet' | 'not_devnet' | 'other' } | { kind: 'unavailable' };

const FAUCET_BLOCKS = ['already_claimed', 'not_needed', 'no_wallet', 'not_devnet'] as const;

export function parseSponsorFaucet(body: unknown): SponsorFaucetResult {
  const b = row(body);
  const signature = text(b.signature);
  if (signature) return { kind: 'sent', signature, explorerUrl: text(b.explorer_url), lamports: int(b.lamports) };
  const reason = FAUCET_BLOCKS.find((x) => x === b.blocked);
  return reason ? { kind: 'blocked', reason } : b.blocked ? { kind: 'blocked', reason: 'other' } : { kind: 'unavailable' };
}

export async function requestSponsorFaucet(): Promise<SponsorFaucetResult> {
  try {
    return parseSponsorFaucet((await callShop('wallet-faucet', { body: { purpose: 'sponsor' } })).data);
  } catch (error) {
    if (error instanceof ShopCallError && (error.code === 'faucet_unavailable' || error.code === 'rpc_unavailable')) return { kind: 'unavailable' };
    throw error;
  }
}

export const withdrawBounty = (bounty: string, onPhase?: (phase: StepPhase) => void): Promise<SignedStepResult> => signedStep('withdraw', bounty, onPhase);

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
    ...(input.inviteeWallet ? { invitee_wallet: input.inviteeWallet } : {}),
    ...(input.prizeTera ? { prize_tera: { brand: input.prizeTera.brand, accent: input.prizeTera.accent, base: input.prizeTera.base } } : {}),
  });
  const r = row(data);
  const id = text(r.id);
  const slug = text(r.slug);
  if (!id || !slug) throw new Error('bounty-post: unreadable create answer');
  return {
    id,
    slug,
    direct: r.direct === true,
    inviteeWallet: text(r.invitee_wallet),
    inviteeEligible: typeof r.invitee_eligible === 'boolean' ? r.invitee_eligible : null,
    inviteeReason: INVITEE_REASONS.find((x) => x === r.invitee_reason) ?? null,
    fundActionUrl: safeHttpsUrl(text(row(r.fund).action_url)),
    fundBlinkUrl: safeHttpsUrl(text(row(r.fund).blink_url)),
  };
}

export function parseInviteeCheck(body: unknown): InviteeCheck | null {
  const r = row(body);
  const wallet = text(r.wallet);
  const req = row(r.requirement);
  const proof = row(r.proof);
  if (!wallet || typeof r.eligible !== 'boolean') return null;
  return {
    wallet,
    directAvailable: r.direct_available !== false,
    knownLearner: r.known_learner === true,
    eligible: r.eligible,
    reason: INVITEE_REASONS.find((x) => x === r.reason) ?? null,
    proof: text(proof.asset) ? { asset: String(proof.asset), daysDone: int(proof.days_done) ?? 0, explorerUrl: text(proof.explorer_url) } : null,
    requirement: { unitId: text(req.unit_id) ?? '', minDays: int(req.min_days) ?? 0, totalDays: int(req.total_days) ?? 0 },
  };
}

export async function checkInvitee(input: { wallet: string; unitId: string; minDays: number }): Promise<InviteeCheck> {
  const { data } = await postCall({ action: 'invitee_check', wallet: input.wallet, unit_id: input.unitId, min_days: input.minDays });
  const check = parseInviteeCheck(data);
  if (!check) throw new Error('bounty-post: unreadable invitee check');
  return check;
}

export function parseInbox(body: unknown): InvitedInbox | null {
  const r = row(body);
  const wallet = text(r.wallet);
  if (!wallet) return null;
  return { wallet, chainRead: r.chain_read === true, openCount: int(r.open_count) ?? 0, bounties: parseBounties(r.bounties) };
}

export async function getInvitedInbox(wallet: string, lang: string): Promise<InvitedInbox> {
  if (!url || !anonKey) throw new Error('Supabase not configured.');
  const res = await fetch(`${url}/functions/v1/bounty-board/invited/${encodeURIComponent(wallet)}?lang=${lang}`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
  if (!res.ok) throw new Error(`bounty-board failed (${res.status})`);
  const inbox = parseInbox(await res.json());
  if (!inbox) throw new Error('bounty-board: unreadable inbox');
  return inbox;
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

export async function deletePostedDraft(bounty: string): Promise<void> {
  await postCall({ action: 'delete', bounty });
}

export async function reportBounty(bounty: string, reason: string): Promise<void> {
  await postCall({ action: 'report', bounty, reason: reason.trim() });
}

export interface TxErrorInfo {
  key: string;
  vars: Record<string, string | number>;
  faucet: boolean;
}

const TX_CODES = ['insufficient_funds', 'not_fundable', 'already_funded', 'not_submitted', 'chain_mismatch', 'already_paid', 'self_review', 'not_refundable', 'already_refunded', 'broadcast_failed', 'too_many_today', 'too_many_live', 'no_wallet', 'funded', 'not_a_draft'];

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
    const cost = int(error.body?.cost_lamports);
    const keep = int(error.body?.keep_lamports);
    // One total: the cost is the number the form shows; what the wallet must keep on top of it is named apart.
    if (cost !== null && keep !== null && have !== null) return { key: 'bounty.tx.err.insufficient_funds.split', vars: { cost: solText(cost), keep: solText(keep), have: solText(have) }, faucet: true };
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
