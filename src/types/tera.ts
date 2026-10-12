/** The Tera catalog and the origin of a Tera, as the functions answer them. */
export interface TeraTier {
  rarity: string;
  rank: number;
  tierName: { pt: string; en: string };
  label: { pt: string; en: string };
  /** Never for sale: the tier only comes out of the chest of a stamped day. */
  earnOnly: boolean;
}

export interface TeraCatalog {
  /** `bundled` is the copy shipped with the app: what the page shows with no network. */
  source: 'live' | 'bundled';
  /** Lowest rank first. */
  tiers: TeraTier[];
  /** Rarity of each Tera by key. A Tera that is not here, or is `free`, is a free face. */
  avatars: Record<string, string>;
}

export type ChestStatus = 'committed' | 'rolling' | 'minted' | 'failed';

/** The Tera a chest gave, with the links that prove it. */
export interface ChestTera {
  key: string;
  title: string;
  tierName: string;
  /** Rarity key of its tier (`rare`, `legendary`…), when the backend sends it. */
  rarity?: string | null;
  imageUrl: string;
  thumbUrl: string;
  asset: string | null;
  pageUrl: string | null;
  explorerUrl: string | null;
}

/** The chest of one stamped day. `committed`: the future slot is on chain; `rolling`: its block exists; `minted`: the Tera is in the wallet. */
export interface Chest {
  id: string;
  day: number;
  /** The lesson whose day opened it. */
  lessonId?: string | null;
  trail: string;
  certification: string;
  status: ChestStatus;
  commit: { slot: number; tx: string; value?: string; txSlot?: number | null; via?: string } | null;
  /** 0 to 3: the effort level written inside the commitment. */
  level?: number | null;
  effort?: { verified: number; gradable: number; clean: boolean; gold: boolean } | null;
  seed: { slot: number; blockhash: string } | null;
  /** Rarity key of the tier the roll landed on (`rare`, `legendary`…). */
  tier: string | null;
  odds: { tier: string; weight: number }[];
  tera: ChestTera | null;
  /** How long to wait before asking again, when the chest is not settled. */
  retryAfterMs: number | null;
}

/** Everything a stranger needs to roll a chest again. */
export interface ChestRecompute {
  formula: string;
  inputs: Record<string, string | number>;
  /** The exact text whose sha256 the on-chain commitment names: the ordered pool of every tier. */
  poolDocument: string;
  /** Teras this chest could not give: the ones the learner held already and the editions used up. From Itera's tables. */
  unavailable: string[];
  held: string[];
  exhausted: string[];
  /** Names of the inputs that anyone reads from the chain. */
  fromChain: string[];
  steps: string[];
}

export interface ChestList {
  /** False when the feature is switched off or its function is not there: nothing about chests is drawn. */
  enabled: boolean;
  chests: Chest[];
}

export type TeraOriginKind = 'earned' | 'bought' | 'sponsor';

/** How a Tera was obtained, whether it can change hands, and where anyone checks it. */
export interface TeraOrigin {
  kind: TeraOriginKind;
  transferable: boolean;
  proof: { asset: string; explorerUrl: string | null } | null;
  /** Earned: the certification and day whose chest gave it. */
  earned: { certification: string; trail: string; day: number; tier: string; chestId: string } | null;
  /** Sponsored: the brand that funded it and the bounty that paid it. */
  sponsor: { brand: string; accent: string; bountySlug: string; bountyTitle: string; payoutTx: string } | null;
}
