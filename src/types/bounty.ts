export type BountyStatus = 'awaiting_funding' | 'open' | 'claimed' | 'submitted' | 'paying' | 'paid' | 'refunding' | 'refunded' | 'expired';

export type LedgerKind = 'created' | 'funded' | 'accepted' | 'submitted' | 'approved' | 'rejected' | 'withdrawn' | 'expired' | 'paid' | 'refund_started' | 'refunded';

export interface BountyRequirement {
  program: string;
  unitId: string;
  trail: string;
  minDays: number;
  totalDays: number;
}

export interface BountyEscrow {
  address: string;
  explorerUrl: string | null;
  targetLamports: number;
  refundAddress: string | null;
  /** `program`: an on-chain program holds the funds. `itera_server`: an account whose key the Itera server holds. */
  custody: 'program' | 'itera_server';
  programId: string | null;
  programExplorerUrl: string | null;
}

export interface BountyClaim {
  wallet: string;
  walletShort: string;
  profileUrl: string | null;
  status: string;
  acceptedAt: string | null;
  deadlineAt: string | null;
  submittedAt: string | null;
  proofAsset: string | null;
  proofUrl: string | null;
  submissionUrl: string | null;
  submissionMirrored: boolean;
}

export interface BountyMoney {
  signature: string;
  lamports: number;
  sol: string;
  at: string | null;
  wallet: string | null;
  explorerUrl: string | null;
}

export interface PostedBy {
  kind: 'team' | 'wallet';
  name: string;
  wallet: string | null;
  walletShort: string | null;
  profileUrl: string | null;
}

export type BountyLang = 'pt' | 'en';

export interface Bounty {
  id: string;
  slug: string;
  slugs: { pt: string; en: string };
  postedBy: PostedBy;
  approver: 'sponsor_wallet' | 'itera';
  rehearsal: boolean;
  hidden: boolean;
  writtenIn: BountyLang | null;
  sponsor: string;
  title: string;
  summary: string;
  brief: string;
  deliverable: string;
  status: BountyStatus;
  rewardLamports: number;
  rewardSol: string;
  requirement: BountyRequirement;
  escrow: BountyEscrow | null;
  claimHours: number;
  expiresAt: string | null;
  createdAt: string | null;
  claim: BountyClaim | null;
  funding: BountyMoney | null;
  payout: BountyMoney | null;
  refund: BountyMoney | null;
  fundBlinkUrl: string | null;
}

export interface LedgerEvent {
  kind: LedgerKind | string;
  wallet: string | null;
  lamports: number | null;
  sol: string | null;
  signature: string | null;
  /** The wallet that signed this step's instruction on chain. Null: not recorded, or the step has no transaction. */
  signedBy: string | null;
  explorerUrl: string | null;
  at: string | null;
}

export interface BountyDetail extends Bounty {
  events: LedgerEvent[];
}

export interface BountyStats {
  paidSol: string;
  lockedSol: string;
  paidCount: number;
  openCount: number;
  rehearsalPaidCount: number;
  rehearsalPaidSol: string;
  outsidePaidCount: number;
  outsidePaidSol: string;
  heldCount: number;
  outsideSponsorCount: number;
}

export interface BountyBoard {
  readAt: string | null;
  stats: BountyStats;
  bounties: Bounty[];
}

export type EligibilityReason = 'no_wallet' | 'no_certification' | 'not_enough_days';

export interface MyBountyStatus {
  wallet: string | null;
  eligible: boolean;
  reason: EligibilityReason | null;
  proof: { asset: string; daysDone: number; explorerUrl: string | null } | null;
  claim: {
    bountyId: string;
    status: string;
    acceptedAt: string | null;
    deadlineAt: string | null;
    submissionUrl: string | null;
    submissionNote: string | null;
    submittedAt: string | null;
    reviewNote: string | null;
  } | null;
  busyElsewhere: boolean;
}

export interface SponsorReview {
  status: string;
  wallet: string | null;
  submissionUrl: string | null;
  submissionNote: string | null;
  submittedAt: string | null;
  proofDays: number | null;
}

export interface SponsorBounty extends Bounty {
  titleI18n: { pt: string; en: string };
  treasuryFundable: boolean;
  review: SponsorReview | null;
}

export interface SponsorTrail {
  unitId: string;
  title: { pt: string; en: string };
  totalDays: number;
}

export interface SponsorList {
  trails: SponsorTrail[];
  bounties: SponsorBounty[];
}

export interface LocalizedText {
  pt: string;
  en: string;
}

export interface CreateBountyInput {
  slug: string;
  sponsorName: string;
  title: LocalizedText;
  summary: LocalizedText;
  brief: LocalizedText;
  deliverable: LocalizedText;
  rewardLamports: number;
  unitId: string;
  minDays: number;
  expiresInDays: number;
  claimHours: number;
  refundAddress: string;
}

export interface ApproveResult {
  outcome: 'settled' | 'pending';
  status: string;
  signature: string | null;
}

export interface PostLimits {
  minRewardLamports: number;
  maxRewardLamports: number;
  escrowRentLamports: number | null;
  feeLamports: number;
  postsPerDay: number;
  liveBounties: number;
  maxExpiryDays: number;
  maxClaimHours: number;
}

export interface PostOptions {
  cluster: string;
  programId: string | null;
  trails: SponsorTrail[];
  limits: PostLimits;
}

export interface PostedReview {
  status: string;
  wallet: string | null;
  submissionUrl: string | null;
  submissionNote: string | null;
  submittedAt: string | null;
  proofDays: number | null;
  proofAsset: string | null;
}

export interface PostedBounty extends Bounty {
  hiddenReason: string | null;
  review: PostedReview | null;
}

export interface PostedList {
  wallet: string;
  balanceLamports: number | null;
  bounties: PostedBounty[];
}

export interface CreatePostedInput {
  sponsorName: string;
  title: Partial<LocalizedText>;
  summary: Partial<LocalizedText>;
  brief: Partial<LocalizedText>;
  deliverable: Partial<LocalizedText>;
  rewardLamports: number;
  unitId: string;
  minDays: number;
  expiresInDays: number;
  claimHours: number;
}

export interface CreatedBounty {
  id: string;
  slug: string;
}

export type WalletTxKind = 'fund' | 'approve' | 'refund';

export interface WalletTx {
  kind: WalletTxKind;
  payer: string;
  messageBase58: string;
  messageBase64: string;
  transactionBase58: string;
  transactionBase64: string;
  costLamports: number;
  rentLamports: number;
  escrow: string | null;
  pays: string | null;
  lamports: number | null;
}

export interface ConfirmResult {
  status: string;
  changed: boolean;
  payoutSignature: string | null;
  refundSignature: string | null;
  fundingSignature: string | null;
}

export type TxPhase = 'preparing' | 'wallet' | 'confirming';

export interface ModerationReport {
  reason: string;
  createdAt: string | null;
}

export interface ModerationBounty {
  id: string;
  slug: string;
  sponsorName: string;
  sponsorWallet: string | null;
  title: string;
  status: string;
  rewardLamports: number;
  hiddenAt: string | null;
  hiddenReason: string | null;
  createdAt: string | null;
  reports: ModerationReport[];
}
