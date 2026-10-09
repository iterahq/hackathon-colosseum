/** Pure state machine of one shop purchase: intent -> wallet -> confirmation, with its side exits. */
export type PurchasePhase =
  | 'idle'
  | 'connecting'
  | 'signing'
  | 'confirming'
  | 'paid'
  | 'failed'
  | 'insufficient'
  | 'funding'
  | 'no_wallet';

export interface PurchaseState {
  phase: PurchasePhase;
  itemKey: string | null;
  /** What went wrong, as the wallet or the backend said it. Shown in the failed state. */
  detail: string | null;
  /** The backend's error code, when the failure came from a function (drives the friendly line). */
  code: string | null;
  explorerUrl: string | null;
}

export type PurchaseEvent =
  | { type: 'start'; itemKey: string }
  | { type: 'connected' }
  | { type: 'signed' }
  | { type: 'paid'; explorerUrl: string | null }
  | { type: 'cancelled' }
  | { type: 'failed'; detail: string; code?: string | null }
  | { type: 'insufficient'; detail: string }
  | { type: 'no_wallet' }
  | { type: 'funding' }
  | { type: 'funding_failed'; detail: string; code?: string | null }
  | { type: 'reset' };

export const PURCHASE_IDLE: PurchaseState = { phase: 'idle', itemKey: null, detail: null, code: null, explorerUrl: null };

const BUSY: readonly PurchasePhase[] = ['connecting', 'signing', 'confirming', 'funding'];
export const isPurchaseBusy = (state: PurchaseState): boolean => BUSY.includes(state.phase);

export function purchaseReducer(state: PurchaseState, event: PurchaseEvent): PurchaseState {
  switch (event.type) {
    case 'start':
      // A second click while one purchase is in flight changes nothing.
      return isPurchaseBusy(state) ? state : { phase: 'connecting', itemKey: event.itemKey, detail: null, code: null, explorerUrl: null };
    case 'connected':
      return state.phase === 'connecting' ? { ...state, phase: 'signing' } : state;
    case 'signed':
      return state.phase === 'signing' ? { ...state, phase: 'confirming' } : state;
    case 'paid':
      return state.phase === 'confirming' ? { ...state, phase: 'paid', explorerUrl: event.explorerUrl } : state;
    case 'cancelled':
      // The learner said no in the wallet: back to rest, no message.
      return isPurchaseBusy(state) ? PURCHASE_IDLE : state;
    case 'failed':
      return isPurchaseBusy(state) ? { ...state, phase: 'failed', detail: event.detail, code: event.code ?? null } : state;
    case 'insufficient':
      return isPurchaseBusy(state) ? { ...state, phase: 'insufficient', detail: event.detail } : state;
    case 'no_wallet':
      return isPurchaseBusy(state) ? { ...state, phase: 'no_wallet' } : state;
    case 'funding':
      return state.phase === 'insufficient' ? { ...state, phase: 'funding' } : state;
    case 'funding_failed':
      return state.phase === 'funding' ? { ...state, phase: 'insufficient', detail: event.detail, code: event.code ?? null } : state;
    case 'reset':
      return isPurchaseBusy(state) ? state : PURCHASE_IDLE;
  }
}
