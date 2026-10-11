/** The one progress story every signed-in surface leads with. */
export interface ProgressStory {
  /** Days finished (stamped on chain when a wallet holds them). */
  daysDone: number;
  /** Days in every trail the learner can take. */
  daysTotal: number;
  /** Capabilities verified on chain, when the wallet's graph was read. */
  verified: number | null;
  capabilitiesTotal: number | null;
  wallet: string | null;
  pending: boolean;
}
