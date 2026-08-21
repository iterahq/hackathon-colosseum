/** Uma linha de `itera.my_subscription` — a autoridade única de entitlement. */
export interface Entitlement {
  /** True when the user has an active (or trialing) subscription. */
  active: boolean;
  status: string | null;
  currentPeriodEnd: string | null;
  /** Null on an exempt tenant row — exemption has no seats to count. */
  seatCount: number | null;
  cancelAtPeriodEnd: boolean;
}
