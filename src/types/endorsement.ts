/** Shapes of the `endorse` edge function (teacher endorsement of a certification), normalised to camelCase. */
export interface StudentCertification {
  id: string;
  learnerName: string | null;
  trail: string;
  daysDone: number;
  totalDays: number;
  tier: string;
  assetAddress: string;
  imageUrl: string | null;
  endorsements: number;
  endorsedByMe: boolean;
}

export interface StudentCertifications {
  /** The instructor's own wallet (sign-in or linked); an endorsement is signed off with it. */
  wallet: string | null;
  certifications: StudentCertification[];
}

/** One endorsement as the public reads it: a wallet, a time and the transaction. Never a name. */
export interface PublicEndorsement {
  wallet: string;
  at: string;
  explorerUrl: string | null;
}

export interface EndorseResult {
  alreadyEndorsed: boolean;
  assetAddress: string;
  explorerUrl: string | null;
  endorsements: PublicEndorsement[];
}
