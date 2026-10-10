import type { LearnerAvatar } from '@/types/avatar';
import type { CircuitShare } from '@/types/circuit';
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
  /** When the chain copy was last written; null for older mirrors. */
  mirroredAt: string | null;
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

export interface ProfileAvatarNft {
  key: string;
  title: string;
  tierName: string;
  serial: number | null;
  verified: boolean;
  imageUrl: string;
  explorerUrl: string | null;
}

export interface LearnerProfile {
  /** NFT avatars the wallet owns; empty when the backend sends none. */
  avatars: ProfileAvatarNft[];
  wallet: string;
  /** The picture the learner wears; the default one when the backend sent none. */
  avatar: LearnerAvatar;
  verifiedCount: number;
  companion: ProfileCompanion | null;
  certifications: ProfileCertification[];
  medals: ProfileMedal[];
  /** What this wallet's own shop purchases paid forward (the Circuito). */
  circuit: CircuitShare;
}

export type ProfileLookup = { status: 'ok'; profile: LearnerProfile } | { status: 'invalid' };
