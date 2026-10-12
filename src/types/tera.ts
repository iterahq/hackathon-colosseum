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
  trail: string;
  certification: string;
  status: ChestStatus;
  commit: { slot: number; tx: string } | null;
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
  pool: string[];
  steps: string[];
}

export interface ChestList {
  /** False when the feature is switched off or its function is not there: nothing about chests is drawn. */
  enabled: boolean;
  chests: Chest[];
}
