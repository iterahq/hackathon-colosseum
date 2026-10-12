import type { ContactField } from '@/types/privacy';

export interface TalentCapability {
  key: string;
  title: string;
}

export interface TalentAvatar {
  key: string;
  title: string;
  thumbUrl: string;
  rarity: string;
}

export interface TalentLearner {
  wallet: string;
  name: string | null;
  avatar: TalentAvatar | null;
  headline: string | null;
  stampedDays: number;
  totalDays: number;
  certifications: number;
  capabilities: TalentCapability[];
  bountiesPaid: number;
  bountiesPaidLamports: number;
  lastStampAt: string | null;
  profileUrl: string;
  teamTest: boolean;
  /** The listing holds a contact a company may ask to see. Nothing of the contact itself is ever in a card. */
  hasContact?: boolean;
}

export interface TalentBoard {
  source: string;
  readAt: string | null;
  totalListed: number;
  capabilities: TalentCapability[];
  learners: TalentLearner[];
}

export interface TalentFilters {
  capability: string;
  minDays: number;
}

export type TalentReason = 'no_wallet' | 'nothing_proven';

export interface TalentStatus {
  wallet: string | null;
  listed: boolean;
  headline: string | null;
  mayList: boolean;
  reason: TalentReason | null;
  stampedDays: number;
  totalDays: number;
  /** Whether the learner's profile page is shown to others: a listing needs it on. Null: the backend does not say. */
  publicProfile?: boolean | null;
  /** WHICH contacts the listing holds; never their values. */
  contactKinds?: ContactField[];
  companiesLooked?: number;
  lastLookedAt?: string | null;
}
