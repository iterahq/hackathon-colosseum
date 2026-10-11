/** The one progress story every signed-in surface leads with. */
export interface ProgressStory {
  /** Days finished: every activity completed, as the server recorded it. Not a chain fact. */
  daysDone: number;
  /** Days written on a certification on chain. This is the only number to call "stamped". */
  daysStamped: number;
  /** Days finished and not on chain yet. */
  daysPending: number;
  /** Days in every trail the learner can take. */
  daysTotal: number;
  /** Capabilities verified on chain, when the wallet's graph was read. */
  verified: number | null;
  capabilitiesTotal: number | null;
  wallet: string | null;
  pending: boolean;
}
