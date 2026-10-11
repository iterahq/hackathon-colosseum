/** The one progress story every signed-in surface leads with. */
export interface ProgressStory {
  /** Days whose activities are all done. */
  daysDone: number;
  /** Days whose stamp is written on chain: the only number the UI calls "stamped". */
  daysStamped: number;
  /** Days done whose stamp is not on chain (held by the server, or still minting). */
  daysPending: number;
  /** Days in every trail the learner can take. */
  daysTotal: number;
  /** Capabilities verified on chain, when the wallet's graph was read. */
  verified: number | null;
  capabilitiesTotal: number | null;
  wallet: string | null;
  pending: boolean;
  /** The trail the learner is on: the one with most days done (the first one until any day is done). Null with no trails. */
  lead: { title: string; daysDone: number; daysStamped: number; totalDays: number } | null;
}
