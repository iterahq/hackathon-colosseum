import type { I18nText } from '@/types/content';

export type AchievementKind = 'day' | 'trail' | 'streak' | 'milestone';
export type MintStatus = 'unclaimed' | 'pending' | 'minted' | 'failed';

/** A row of the achievement catalog (`itera.achievements`). */
export interface Achievement {
  key: string;
  kind: AchievementKind;
  tier: string | null;
  title: I18nText;
  description: I18nText;
  art: Record<string, unknown>;
  sort: number;
}

/** A row of `itera.user_achievements`: one achievement the learner earned. */
export interface UserAchievement {
  achievementKey: string;
  refId: string | null;
  earnedAt: string | null;
  mintStatus: MintStatus;
  assetAddress: string | null;
  txSignature: string | null;
}

/** A catalog entry joined with what the learner earned of it. */
export interface AchievementView extends Achievement {
  earned: UserAchievement | null;
}

/** Per-award progress reported by the `passport` edge function. */
export interface AwardState {
  days_done: number;
  total_days: number;
  tier?: string | null;
  trail?: string | null;
  [extra: string]: unknown;
}

/** One achievement touched by a `passport` call. `title` may be plain text or a locale bag. */
export interface PassportAward {
  key: string;
  kind: AchievementKind;
  tier: string | null;
  title: string | I18nText;
  ref_id: string | null;
  state: AwardState;
  mint_status: MintStatus;
  asset_address: string | null;
  tx_signature: string | null;
  explorer_url: string | null;
}

/** Response of `POST /functions/v1/passport`. */
export interface PassportResult {
  awards: PassportAward[];
  remaining: number;
}

export type CeremonyStatus = 'minting' | 'minted' | 'failed' | 'no_wallet';

/** One page of the passport as the UI draws it: a trail joined with what was earned on it. */
export interface PassportPageData {
  trailId: string;
  trailTitle: string;
  colorIndex: number;
  daysDone: number;
  totalDays: number;
  tier: string | null;
  mintStatus: MintStatus;
  assetAddress: string | null;
  txSignature: string | null;
  earnedAt: string | null;
  locked: boolean;
  lockedBy: string | null;
}

/** A medal as the UI draws it. */
export interface PassportMedal {
  key: string;
  title: string;
  description: string;
  glyph: string;
  earned: boolean;
  mintStatus: MintStatus;
  assetAddress: string | null;
  txSignature: string | null;
}

/** Body of `GET /functions/v1/credential-verify/<asset>`. */
export interface CredentialVerification {
  verified: boolean;
  asset: string;
  owner: string | null;
  frozen: boolean;
  collection: string | null;
  update_authority: string | null;
  attributes: { key: string; value: string }[];
  achievement: { key: string; tier: string | null; title: string | I18nText } | null;
  minted_at: string | null;
}

/** What the public page draws: the verification, or the reason there is none. */
export type CredentialLookup =
  | { status: 'verified' | 'unverified'; data: CredentialVerification; ms: number }
  | { status: 'not_found'; ms: number };
