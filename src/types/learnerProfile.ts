/** Public learner profile (`learner-profile` edge function), normalised to camelCase. */
export interface ProfileCompanion {
  asset: string;
  verified: boolean;
  lives: number | null;
  maxLives: number;
  outfit: string | null;
  level: number | null;
  xp: number | null;
  streak: number | null;
  imageUrl: string | null;
  explorerUrl: string | null;
}

export interface ProfileCertification {
  asset: string;
  verified: boolean;
  trail: string;
  daysDone: number;
  totalDays: number;
  tier: string | null;
  ink: string | null;
  frame: string | null;
  completedAt: string | null;
  earnedAt: string | null;
  imageUrl: string | null;
  pageUrl: string | null;
  explorerUrl: string | null;
}

export interface ProfileMedal {
  asset: string;
  verified: boolean;
  key: string;
  title: string;
  tier: string | null;
  earnedAt: string | null;
  imageUrl: string | null;
  explorerUrl: string | null;
}

export interface LearnerProfile {
  wallet: string;
  verifiedCount: number;
  companion: ProfileCompanion | null;
  certifications: ProfileCertification[];
  medals: ProfileMedal[];
}

export type ProfileLookup = { status: 'ok'; profile: LearnerProfile } | { status: 'invalid' };
