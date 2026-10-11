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
}
