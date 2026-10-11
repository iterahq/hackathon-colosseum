/** Bounties: the public board (`bounty-board`), the learner's side (`bounty-claim`) and the sponsor console (`bounty-sponsor`). */
import { callShop } from '@/services/shopTransport';
import type {
  ApproveResult,
  Bounty,
  BountyBoard,
  BountyClaim,
  BountyDetail,
  BountyMoney,
  BountyStatus,
  CreateBountyInput,
  EligibilityReason,
  LedgerEvent,
  MyBountyStatus,
  SponsorBounty,
  SponsorList,
  SponsorReview,
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
  };
}

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
  return {
    id,
    slug,
    sponsor: text(r.sponsor) ?? '',
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
    },
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
    trails: rows(b.trails)
      .filter((r) => text(r.unit_id))
      .map((r) => {
        const title = row(r.title);
        return { unitId: String(r.unit_id), title: { pt: text(title.pt) ?? '', en: text(title.en) ?? text(title.pt) ?? '' }, totalDays: int(r.total_days) ?? 0 };
      }),
    bounties,
  };
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

export async function acceptBounty(bounty: string): Promise<void> {
  await claimCall('accept', bounty);
}

export async function submitBounty(bounty: string, submissionUrl: string, note: string): Promise<void> {
  await claimCall('submit', bounty, note.trim() ? { url: submissionUrl, note: note.trim() } : { url: submissionUrl });
}

export async function withdrawBounty(bounty: string): Promise<void> {
  await claimCall('withdraw', bounty);
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
