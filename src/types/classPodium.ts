/** Shapes of the `class-podium` edge function (live-class podium medals), normalised to camelCase. */
export interface PodiumPlaceResult {
  position: number;
  key: string;
  title: string;
  userId: string;
  name: string | null;
  correct: number;
  answered: number;
  wallet: string | null;
  mintStatus: string;
  assetAddress: string | null;
  explorerUrl: string | null;
  imageUrl: string | null;
}

/** What the instructor gets back after recording a session's podium. */
export interface PodiumRecord {
  sessionId: string;
  alreadyRecorded: boolean;
  places: PodiumPlaceResult[];
}

/** One place of a recorded podium as any participant of the class may read it. */
export interface PodiumChainPlace {
  position: number;
  userId: string;
  minted: boolean;
  explorerUrl: string | null;
}
