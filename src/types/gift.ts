/** Shapes of the gift and referral backend, normalised to camelCase by the services. */
export interface GiftReceipt {
  id: string;
  fromWallet: string;
  /** The nickname a wallet learner chose; null when there is none to show. */
  fromName: string | null;
  toWallet: string;
  toName: string | null;
  /** The recipient's lives after the gift. */
  recipientLives: number | null;
  recipientMax: number;
  companionExplorerUrl: string | null;
  paymentExplorerUrl: string | null;
  /** The write of the recipient's companion asset, when there was one. */
  mirrorSignature: string | null;
  mirrorExplorerUrl: string | null;
}

export interface GiftPrice {
  priceLabel: string;
  priceLamports: number;
}

export interface ReferralInvite {
  status: 'pending' | 'rewarded';
  at: string;
}

export interface ReferralStatus {
  code: string;
  invited: ReferralInvite[];
  pendingCount: number;
  rewardedCount: number;
}

export interface ReferralClaim {
  claimed: boolean;
  reason: string | null;
}
