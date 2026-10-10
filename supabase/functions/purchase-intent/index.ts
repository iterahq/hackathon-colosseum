import { isSolanaAddress } from '../_shared/address.ts';
import { GLOBAL_REF } from '../_shared/awards.ts';
import { callerFailureStatus, resolveCaller } from '../_shared/caller.ts';
import { CLUSTER } from '../_shared/credential.ts';
import { loadConfig, serviceClient, type IteraClient } from '../_shared/db.ts';
import { openGift, walletUser } from '../_shared/gift-store.ts';
import { corsHeaders, isUuid, json, readJsonObject } from '../_shared/http.ts';
import { expiresAt, fundsCheck } from '../_shared/purchase-verify.ts';
import { RpcError, balanceOf, blockHeight, latestBlockhash } from '../_shared/rpc.ts';
import { ITEM_COLUMNS, ITEM_HANDLERS, PURCHASE_COLUMNS, type PurchaseRow, type ShopItem } from '../_shared/shop-items.ts';
import { isItemKind, type IneligibleCode } from '../_shared/shop-rules.ts';
import { base58Encode, base64Encode, buildTransferMessage, serializeTransaction } from '../_shared/solana-tx.ts';

const INELIGIBLE_STATUS: Record<IneligibleCode, number> = {
  invalid_ref: 400,
  not_needed: 409,
  already_owned: 409,
  passport_required: 409,
  self_gift: 409,
  recipient_full: 409,
  gift_limit: 429,
};
const UNIQUE_VIOLATION = '23505';

interface IntentTerms {
  userId: string;
  wallet: string;
  item: ShopItem;
  refId: string;
  lastValidBlockHeight: number;
  expiresAt: string;
}

/**
 * The open intent for (learner, item, ref): the pending one refreshed with the
 * new blockhash window, or a new row. A pending row at another price is retired.
 */
async function openIntent(db: IteraClient, terms: IntentTerms): Promise<PurchaseRow> {
  const scope = { user_id: terms.userId, item_key: terms.item.key, ref_id: terms.refId };
  const window = { wallet: terms.wallet, last_valid_block_height: terms.lastValidBlockHeight, expires_at: terms.expiresAt };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: refreshed, error: refreshError } = await db
      .from('purchases')
      .update(window)
      .match({ ...scope, status: 'pending', lamports: terms.item.price_lamports })
      .select(PURCHASE_COLUMNS)
      .maybeSingle();
    if (refreshError) throw new Error(`purchases refresh: ${refreshError.message}`);
    if (refreshed) return refreshed as PurchaseRow;

    const { error: retireError } = await db.from('purchases').update({ status: 'expired' }).match({ ...scope, status: 'pending' });
    if (retireError) throw new Error(`purchases retire: ${retireError.message}`);

    const id = crypto.randomUUID();
    const { data: created, error: createError } = await db
      .from('purchases')
      .insert({
        id,
        ...scope,
        ...window,
        lamports: terms.item.price_lamports,
        price_usd_cents: terms.item.price_usd_cents,
        memo: id,
      })
      .select(PURCHASE_COLUMNS)
      .single();
    if (created) return created as PurchaseRow;
    if (createError?.code !== UNIQUE_VIOLATION) throw new Error(`purchases insert: ${createError?.message}`);
  }
  throw new Error('purchases: could not open an intent');
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
    const itemKey = body?.item_key;
    const refId = body?.ref_id ?? GLOBAL_REF;
    if (!body || typeof itemKey !== 'string' || !/^[a-z0-9_]{1,64}$/.test(itemKey) || typeof refId !== 'string' || !isUuid(refId)) {
      return json({ error: 'invalid_body' }, 400, cors);
    }
    if (!caller.wallet) return json({ error: 'no_wallet' }, 403, cors);

    const { data: found, error: itemError } = await db.from('shop_items').select(ITEM_COLUMNS).eq('key', itemKey).maybeSingle();
    if (itemError) throw new Error(`shop_items: ${itemError.message}`);
    const item = found as ShopItem | null;
    if (!item || !isItemKind(item.kind)) return json({ error: 'item_not_found' }, 404, cors);
    if (!item.active) return json({ error: 'item_inactive' }, 409, cors);
    if (!Number.isSafeInteger(item.price_lamports) || item.price_lamports <= 0) throw new Error(`shop_items: bad price for ${item.key}`);

    // A gift names its recipient by wallet address; the purchase is then scoped to that learner.
    let normalizedRef = refId.toLowerCase();
    let recipientWallet: string | null = null;
    if (item.kind === 'gift') {
      if (!isSolanaAddress(body.recipient)) return json({ error: 'invalid_ref' }, 400, cors);
      const recipient = await walletUser(db, body.recipient);
      if (!recipient) return json({ error: 'recipient_not_found' }, 404, cors);
      normalizedRef = recipient.userId;
      recipientWallet = body.recipient;
    }
    const verdict = await ITEM_HANDLERS[item.kind].canBuy({ db, userId: caller.iteraUserId, item, refId: normalizedRef });
    if (!verdict.ok) return json({ error: verdict.error }, INELIGIBLE_STATUS[verdict.error], cors);

    const { treasury } = await loadConfig(db);
    if (!isSolanaAddress(treasury) || treasury === caller.wallet) return json({ error: 'shop_not_configured' }, 503, cors);

    let chain: { balance: bigint; blockhash: string; lastValidBlockHeight: number; height: number };
    try {
      const [balance, latest, height] = await Promise.all([balanceOf(caller.wallet), latestBlockhash(), blockHeight()]);
      chain = { balance, ...latest, height };
    } catch (error) {
      if (!(error instanceof RpcError)) throw error;
      console.error('purchase-intent rpc failed', error.message);
      return json({ error: 'rpc_unavailable' }, 503, cors);
    }

    const price = BigInt(item.price_lamports);
    const funds = fundsCheck(chain.balance, price);
    if (!funds.ok) {
      return json(
        { error: 'insufficient_funds', balance_lamports: Number(chain.balance), required_lamports: Number(funds.required), price_lamports: item.price_lamports },
        402,
        cors,
      );
    }

    const intent = await openIntent(db, {
      userId: caller.iteraUserId,
      wallet: caller.wallet,
      item,
      refId: normalizedRef,
      lastValidBlockHeight: chain.lastValidBlockHeight,
      expiresAt: expiresAt(new Date(), chain.height, chain.lastValidBlockHeight),
    });
    if (recipientWallet) {
      await openGift(db, {
        id: intent.id,
        source: 'app',
        fromWallet: caller.wallet,
        fromUserId: caller.iteraUserId,
        toUserId: normalizedRef,
        toWallet: recipientWallet,
        lamports: item.price_lamports,
        lastValidBlockHeight: chain.lastValidBlockHeight,
        expiresAt: intent.expires_at,
      });
    }
    const message = buildTransferMessage({
      payer: caller.wallet,
      recipient: treasury,
      lamports: price,
      memo: intent.memo,
      recentBlockhash: chain.blockhash,
    });
    const transaction = serializeTransaction(message);
    return json(
      {
        intent_id: intent.id,
        message_base58: base58Encode(message),
        message_base64: base64Encode(message),
        transaction_base58: base58Encode(transaction),
        transaction_base64: base64Encode(transaction),
        price_lamports: item.price_lamports,
        price_usd_cents: item.price_usd_cents,
        price_label: item.price_label,
        last_valid_block_height: chain.lastValidBlockHeight,
        expires_at: intent.expires_at,
        treasury,
        memo: intent.memo,
        cluster: CLUSTER,
        ...(recipientWallet ? { recipient: { wallet: recipientWallet } } : {}),
      },
      200,
      cors,
    );
  } catch (error) {
    console.error('purchase-intent failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
