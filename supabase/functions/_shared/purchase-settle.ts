import { isSolanaAddress } from './address.ts';
import type { Caller } from './caller.ts';
import { circuitWithin } from './circuit-store.ts';
import { companionResponse, ensureCompanion, loadInventory, loadStats } from './companion-store.ts';
import { awardView, chainBlock, explorerUrl, pickText, writtenList, type CatalogEntry } from './credential.ts';
import { CATALOG_COLUMNS, loadConfig, type IteraClient } from './db.ts';
import { functionsBase } from './http.ts';
import { settlePayment, settledElsewhere } from './payments.ts';
import { intentPhase, missingTransactionVerdict, verifyPayment, type ParsedTransaction, type PaymentExpectation, type PaymentVerdict } from './purchase-verify.ts';
import { RpcError, blockHeight, rpc } from './rpc.ts';
import { giftView } from './gift-store.ts';
import { ITEM_COLUMNS, ITEM_HANDLERS, PURCHASE_COLUMNS, type ApplyOutcome, type PurchaseRow, type ShopItem } from './shop-items.ts';
import { isItemKind } from './shop-rules.ts';

const LOOKUP_ATTEMPTS = 6;
const LOOKUP_PAUSE_MS = 1_000;
/** How long a paid answer waits for the Circuito transfer before saying `pending`. */
const CIRCUIT_BUDGET_MS = 6_000;

export type Lang = 'pt' | 'en';

/** The confirmed transaction, retried briefly while it propagates. `null` when it is not visible. */
async function findTransaction(signature: string): Promise<ParsedTransaction | null> {
  for (let attempt = 0; attempt < LOOKUP_ATTEMPTS; attempt += 1) {
    const found = await rpc<ParsedTransaction | null>('getTransaction', [
      signature,
      { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
    ]);
    if (found) return found;
    if (attempt < LOOKUP_ATTEMPTS - 1) await new Promise((resolve) => setTimeout(resolve, LOOKUP_PAUSE_MS));
  }
  return null;
}

async function loadIntent(db: IteraClient, intentId: string, userId: string): Promise<PurchaseRow | null> {
  const { data, error } = await db.from('purchases').select(PURCHASE_COLUMNS).eq('id', intentId).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`purchases: ${error.message}`);
  return data as PurchaseRow | null;
}

async function paidResponse(db: IteraClient, intent: PurchaseRow, item: ShopItem, outcome: ApplyOutcome, lang: Lang) {
  const now = new Date();
  const [companion, stats] = await Promise.all([ensureCompanion(db, intent.user_id), loadStats(db, intent.user_id, now)]);
  const response: Record<string, unknown> = {
    status: 'paid',
    intent_id: intent.id,
    item: { key: item.key, kind: item.kind, title: pickText(item.title_i18n, lang) },
    inventory: await loadInventory(db, intent.user_id, companion.outfit),
    passport: null,
    explorer_url: explorerUrl('tx', intent.tx_signature),
  };
  if (outcome.companion) Object.assign(response, companionResponse(companion, stats, now));
  if (outcome.passport) {
    const { data: catalog, error } = await db.from('achievements').select(CATALOG_COLUMNS).eq('key', 'trail_pass').single();
    if (error) throw new Error(`achievements: ${error.message}`);
    const view = awardView(outcome.passport, catalog as CatalogEntry, lang, functionsBase());
    response.passport = view;
    response.image_url = `${view.image_url}?lang=${lang}&v=${now.getTime()}`;
  }
  if (outcome.gift) response.gift = await giftView(db, outcome.gift);
  if (outcome.chain) {
    response.chain = chainBlock(outcome.chain);
    response.written = writtenList(outcome.chain);
  }
  return response;
}

export interface Settlement {
  status: number;
  body: Record<string, unknown>;
}

export interface SettleInput {
  intentId: string;
  signature: string;
  lang: Lang;
  /**
   * Runs once the intent is known to be the caller's and still payable, before
   * the transaction is looked up on chain. Returning a settlement stops there.
   */
  beforeLookup?: (expected: PaymentExpectation) => Promise<Settlement | null>;
}

export function paymentRefusal(payment: PaymentVerdict): Settlement | null {
  if (payment.ok) return null;
  return { status: 422, body: payment.error === 'tx_failed' ? { error: 'tx_failed' } : { error: payment.error, detail: payment.detail } };
}

/**
 * Settles an intent against a transaction signature: verifies the payment on
 * chain, records it once and applies the item. Shared by `purchase-confirm` and
 * `purchase-submit`; safe to repeat for the same intent and signature.
 */
export async function settlePurchase(db: IteraClient, caller: Caller, input: SettleInput): Promise<Settlement> {
  const { signature, lang } = input;
  if (!caller.wallet) return { status: 403, body: { error: 'no_wallet' } };

  let intent = await loadIntent(db, input.intentId, caller.iteraUserId);
  if (!intent) return { status: 404, body: { error: 'intent_not_found' } };

  const { data: found, error: itemError } = await db.from('shop_items').select(ITEM_COLUMNS).eq('key', intent.item_key).single();
  if (itemError) throw new Error(`shop_items: ${itemError.message}`);
  const item = found as ShopItem;
  if (!isItemKind(item.kind)) throw new Error(`shop_items: unknown kind ${item.kind}`);

  const phase = intentPhase({ status: intent.status, expiresAt: intent.expires_at }, new Date());
  if (phase === 'expired') return { status: 410, body: { error: 'intent_expired' } };
  if (phase === 'paid' && intent.tx_signature !== signature) return { status: 409, body: { error: 'intent_already_paid' } };

  if (phase === 'confirmable') {
    if (await settledElsewhere(db, signature, intent.id)) return { status: 409, body: { error: 'signature_reused' } };

    const { treasury } = await loadConfig(db);
    if (!isSolanaAddress(treasury)) return { status: 503, body: { error: 'shop_not_configured' } };
    if (intent.wallet !== caller.wallet) return { status: 422, body: { error: 'payment_mismatch', detail: 'payer' } };
    const expected = { wallet: intent.wallet, treasury, lamports: BigInt(intent.lamports), memo: intent.memo };

    const refusal = await input.beforeLookup?.(expected);
    if (refusal) return refusal;

    let transaction: ParsedTransaction | null;
    try {
      transaction = await findTransaction(signature);
      if (!transaction) {
        const verdict = missingTransactionVerdict(await blockHeight(), intent.last_valid_block_height);
        if (verdict === 'intent_expired') {
          await db.from('purchases').update({ status: 'expired' }).eq('id', intent.id).eq('status', 'pending');
          return { status: 410, body: { error: 'intent_expired' } };
        }
        return { status: 404, body: { error: 'tx_not_found', retryable: true } };
      }
    } catch (error) {
      if (!(error instanceof RpcError)) throw error;
      console.error('purchase lookup rpc failed', error.message);
      return { status: 503, body: { error: 'rpc_unavailable', retryable: true } };
    }

    const refused = paymentRefusal(verifyPayment(transaction, expected));
    if (refused) return refused;

    // Ledger entry and `paid` in one database transaction: this signature settles this intent and nothing else, ever.
    const ledger = await settlePayment(db, 'purchase', intent.id, signature, intent.lamports);
    if (ledger === 'signature_reused') return { status: 409, body: { error: 'signature_reused' } };
    if (ledger === 'already_paid') return { status: 409, body: { error: 'intent_already_paid' } };
    if (ledger !== 'settled') return { status: 410, body: { error: 'intent_expired' } };
    intent = await loadIntent(db, input.intentId, caller.iteraUserId);
    if (!intent || intent.status !== 'paid') throw new Error('purchases: intent is not paid after settling');
    if (intent.tx_signature !== signature) return { status: 409, body: { error: 'intent_already_paid' } };
  }

  let outcome: ApplyOutcome;
  try {
    outcome = await ITEM_HANDLERS[item.kind].apply({ db, userId: caller.iteraUserId, item, refId: intent.ref_id, purchase: intent });
    const { error } = await db.from('purchases').update({ applied_at: new Date().toISOString(), error: null }).eq('id', intent.id);
    if (error) throw new Error(`purchases applied: ${error.message}`);
  } catch (error) {
    console.error(`purchase ${intent.id} effect failed`, error);
    const message = String(error instanceof Error ? error.message : error).slice(0, 300);
    await db.from('purchases').update({ error: message, applied_at: null }).eq('id', intent.id);
    return { status: 502, body: { error: 'apply_failed', status: 'paid', retryable: true, explorer_url: explorerUrl('tx', intent.tx_signature) } };
  }

  // The item is applied: the purchase now pays its share forward. Once per purchase, whatever is repeated.
  const [body, circuit] = await Promise.all([paidResponse(db, intent, item, outcome, lang), circuitWithin(db, intent.id, CIRCUIT_BUDGET_MS)]);
  return { status: 200, body: circuit ? { ...body, circuit } : body };
}
