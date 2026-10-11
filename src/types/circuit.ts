/** Shapes of the Circuito (the shop pays the network fee of other learners' stamps), normalised to camelCase. */
export interface CircuitShare {
  lamports: number;
  stampsFunded: number;
}

/** The shop's own price shelf, cheapest and dearest item on sale right now. */
export interface CircuitShopRange {
  minUsdCents: number;
  maxUsdCents: number;
  items: number;
}

/**
 * The public counter: every confirmed transfer, the team's own test runs included (it never shrinks),
 * plus the same sum without the tagged test accounts (`outside`), the maths that turn purchases into
 * stamps, the shop's price range and (when asked for a wallet) what that wallet's own purchases paid forward.
 */
export interface CircuitCounter extends CircuitShare {
  purchases: number;
  asOf: string | null;
  purchaseLamports: number;
  sharePercent: number;
  stampFeeLamports: number;
  outside: (CircuitShare & { purchases: number; testAccountsLeftOut: number }) | null;
  shop: CircuitShopRange | null;
  treasuryExplorerUrl: string | null;
  authorityExplorerUrl: string | null;
  wallet: CircuitShare | null;
}

/** What one purchase paid forward, as its confirmation reports it. */
export interface PurchaseCircuit {
  status: string;
  stampsFunded: number;
  explorerUrl: string | null;
}
