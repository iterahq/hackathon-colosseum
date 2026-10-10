/** Shapes of the Circuito (the shop pays the network fee of other learners' stamps), normalised to camelCase. */
export interface CircuitShare {
  lamports: number;
  stampsFunded: number;
}

/** The public counter, plus (when asked for a wallet) what that wallet's own purchases paid forward. */
export interface CircuitCounter extends CircuitShare {
  purchases: number;
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
