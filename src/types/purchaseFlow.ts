import type { WalletSigned } from '@/services/walletSign';

/** What the learner asked to buy, kept for "try again" and for the faucet round. */
export interface PurchaseOrder {
  itemKey: string;
  refId?: string;
  recipient?: string;
}

/** What the wallet already did for an intent: enough to confirm the payment without asking again. */
export interface WalletPayment {
  itemKey: string;
  intentId: string;
  signed: WalletSigned;
}
