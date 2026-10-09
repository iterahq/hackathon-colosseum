import { isSolanaAddress } from '../_shared/address.ts';
import { callerFailureStatus, resolveCaller } from '../_shared/caller.ts';
import { companionResponse, ensureCompanion, loadInventory, loadStats } from '../_shared/companion-store.ts';
import { awardView, chainBlock, explorerUrl, pickText, writtenList, type CatalogEntry } from '../_shared/credential.ts';
import { CATALOG_COLUMNS, loadConfig, serviceClient, type IteraClient } from '../_shared/db.ts';
import { corsHeaders, functionsBase, isUuid, json, readJsonObject } from '../_shared/http.ts';
import { intentPhase, missingTransactionVerdict, verifyPayment, type ParsedTransaction } from '../_shared/purchase-verify.ts';
import { RpcError, blockHeight, rpc } from '../_shared/rpc.ts';
import { ITEM_COLUMNS, ITEM_HANDLERS, PURCHASE_COLUMNS, type ApplyOutcome, type PurchaseRow, type ShopItem } from '../_shared/shop-items.ts';
import { isItemKind } from '../_shared/shop-rules.ts';
import { isSignature } from '../_shared/solana-tx.ts';

const LOOKUP_ATTEMPTS = 6;
const LOOKUP_PAUSE_MS = 1_000;
const UNIQUE_VIOLATION = '23505';

type Lang = 'pt' | 'en';

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
  if (outcome.chain) {
    response.chain = chainBlock(outcome.chain);
    response.written = writtenList(outcome.chain);
  }
  return response;
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const db = serviceClient();
    const caller = await resolveCaller(db, request);
    if (typeof caller === 'string') return json({ error: caller }, callerFailureStatus(caller), cors);

    const body = await readJsonObject(request);
    const intentId = body?.intent_id;
    const signature = body?.signature;
    const lang: Lang = body?.lang === 'en' ? 'en' : 'pt';
    if (!body || typeof intentId !== 'string' || !isUuid(intentId) || !isSignature(signature)) {
      return json({ error: 'invalid_body' }, 400, cors);
    }
    if (!caller.wallet) return json({ error: 'no_wallet' }, 403, cors);

    let intent = await loadIntent(db, intentId, caller.iteraUserId);
    if (!intent) return json({ error: 'intent_not_found' }, 404, cors);

    const { data: found, error: itemError } = await db.from('shop_items').select(ITEM_COLUMNS).eq('key', intent.item_key).single();
    if (itemError) throw new Error(`shop_items: ${itemError.message}`);
    const item = found as ShopItem;
    if (!isItemKind(item.kind)) throw new Error(`shop_items: unknown kind ${item.kind}`);

    const phase = intentPhase({ status: intent.status, expiresAt: intent.expires_at }, new Date());
    if (phase === 'expired') return json({ error: 'intent_expired' }, 410, cors);
    if (phase === 'paid' && intent.tx_signature !== signature) return json({ error: 'intent_already_paid' }, 409, cors);

    if (phase === 'confirmable') {
      const { data: reused, error: reuseError } = await db.from('purchases').select('id').eq('tx_signature', signature).neq('id', intent.id).limit(1);
      if (reuseError) throw new Error(`purchases reuse: ${reuseError.message}`);
      if ((reused ?? []).length > 0) return json({ error: 'signature_reused' }, 409, cors);

      const { treasury } = await loadConfig(db);
      if (!isSolanaAddress(treasury)) return json({ error: 'shop_not_configured' }, 503, cors);
      if (intent.wallet !== caller.wallet) return json({ error: 'payment_mismatch', detail: 'payer' }, 422, cors);

      let transaction: ParsedTransaction | null;
      try {
        transaction = await findTransaction(signature);
        if (!transaction) {
          const verdict = missingTransactionVerdict(await blockHeight(), intent.last_valid_block_height);
          if (verdict === 'intent_expired') {
            await db.from('purchases').update({ status: 'expired' }).eq('id', intent.id).eq('status', 'pending');
            return json({ error: 'intent_expired' }, 410, cors);
          }
          return json({ error: 'tx_not_found', retryable: true }, 404, cors);
        }
      } catch (error) {
        if (!(error instanceof RpcError)) throw error;
        console.error('purchase-confirm rpc failed', error.message);
        return json({ error: 'rpc_unavailable', retryable: true }, 503, cors);
      }

      const payment = verifyPayment(transaction, {
        wallet: intent.wallet,
        treasury,
        lamports: BigInt(intent.lamports),
        memo: intent.memo,
      });
      if (!payment.ok) {
        return json(payment.error === 'tx_failed' ? { error: 'tx_failed' } : { error: payment.error, detail: payment.detail }, 422, cors);
      }

      const { error: payError } = await db
        .from('purchases')
        .update({ status: 'paid', tx_signature: signature, paid_at: new Date().toISOString(), error: null })
        .eq('id', intent.id)
        .in('status', ['pending', 'expired']);
      if (payError?.code === UNIQUE_VIOLATION) return json({ error: 'signature_reused' }, 409, cors);
      if (payError) throw new Error(`purchases pay: ${payError.message}`);
      intent = await loadIntent(db, intentId, caller.iteraUserId);
      if (!intent || intent.status !== 'paid') throw new Error('purchases: intent is not paid after settling');
      if (intent.tx_signature !== signature) return json({ error: 'intent_already_paid' }, 409, cors);
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
      return json({ error: 'apply_failed', status: 'paid', retryable: true, explorer_url: explorerUrl('tx', intent.tx_signature) }, 502, cors);
    }

    return json(await paidResponse(db, intent, item, outcome, lang), 200, cors);
  } catch (error) {
    console.error('purchase-confirm failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
