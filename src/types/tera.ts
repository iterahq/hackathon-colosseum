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
