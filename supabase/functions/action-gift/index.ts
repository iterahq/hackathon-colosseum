import { isSolanaAddress } from '../_shared/address.ts';
import { companionImageUrl } from '../_shared/companion.ts';
import { loadConfig, serviceClient, type IteraClient } from '../_shared/db.ts';
import { reconcileGifts } from '../_shared/gift-reconcile.ts';
import {
  GIFT_COLUMNS,
  GiftError,
  openGift,
  publicNameOf,
  recipientFacts,
  settleActionGift,
  walletUser,
  type GiftFailure,
  type GiftRow,
  type RecipientFacts,
} from '../_shared/gift-store.ts';
import {
  actionError,
  actionHeaders,
  giftActionCompleted,
  giftActionGet,
  giftActionPost,
  publicLabel,
  solAmount,
  type GiftErrorCode,
  type Lang,
} from '../_shared/gift.ts';
import { functionsBase, isUuid, langOf, pathAfter, readJsonObject } from '../_shared/http.ts';
import { expiresAt, fundsCheck } from '../_shared/purchase-verify.ts';
import { RpcError, balanceOf, blockHeight, latestBlockhash } from '../_shared/rpc.ts';
import { ITEM_COLUMNS, type ShopItem } from '../_shared/shop-items.ts';
import { eligibility } from '../_shared/shop-rules.ts';
import { base64Encode, buildTransferMessage, isSignature, serializeTransaction } from '../_shared/solana-tx.ts';

const FUNCTION = 'action-gift';
const ITEM_KEY = 'life_gift';
/** How long the callback waits for the recipient's companion to be written before answering. */
const MIRROR_WAIT_MS = 6_000;
const FAILURE_STATUS: Record<GiftFailure, number> = {
  gift_not_found: 404,
  gift_expired: 410,
  payer_mismatch: 422,
  tx_not_found: 404,
  tx_failed: 422,
  payment_mismatch: 422,
  signature_reused: 409,
  unavailable: 503,
};

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...actionHeaders(), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const refuse = (code: GiftErrorCode, lang: Lang, status: number) => answer(actionError(code, lang), status);

interface Recipient {
  wallet: string;
  userId: string;
  who: string;
  facts: RecipientFacts;
  icon: string;
}

async function loadRecipient(db: IteraClient, wallet: string, lang: Lang): Promise<Recipient | null> {
  const user = await walletUser(db, wallet);
  if (!user) return null;
  const [name, facts] = await Promise.all([publicNameOf(db, user), recipientFacts(db, user.userId, new Date())]);
  const icon = `${companionImageUrl(functionsBase(), facts.companionId)}?lang=${lang}&v=${facts.companionVersion}-${facts.outfit ?? 'none'}`;
  return { wallet, userId: user.userId, who: publicLabel(name, wallet), facts, icon };
}

async function loadItem(db: IteraClient): Promise<ShopItem | null> {
  const { data, error } = await db.from('shop_items').select(ITEM_COLUMNS).eq('key', ITEM_KEY).maybeSingle();
  if (error) throw new Error(`shop_items: ${error.message}`);
  const item = data as ShopItem | null;
  return item && item.active && Number.isSafeInteger(item.price_lamports) && item.price_lamports > 0 ? item : null;
}

/** Why this recipient cannot be given a life by this payer right now; `null` when they can. */
function blockedBy(recipient: Recipient, payerId: string | null): GiftErrorCode | null {
  const verdict = eligibility('gift', { ...recipient.facts, refId: recipient.userId, owned: false, passportMinted: false, payerId });
  if (verdict.ok) return null;
  return verdict.error === 'self_gift' || verdict.error === 'recipient_full' || verdict.error === 'gift_limit' ? verdict.error : 'invalid_body';
}

const actionHref = (wallet: string, lang: Lang) => `${functionsBase()}/${FUNCTION}?to=${wallet}&lang=${lang}`;

async function describe(db: IteraClient, wallet: string, lang: Lang): Promise<Response> {
  const [recipient, item] = await Promise.all([loadRecipient(db, wallet, lang), loadItem(db)]);
  if (!recipient) return refuse('recipient_not_found', lang, 404);
  if (!item) return refuse('unavailable', lang, 503);
  return answer(
    giftActionGet({
      lang,
      who: recipient.who,
      icon: recipient.icon,
      price: solAmount(item.price_lamports),
      href: actionHref(wallet, lang),
      blocked: blockedBy(recipient, null),
    }),
  );
}

/** The unpaid gift this payer already opened for this recipient, so a repeated POST refreshes one row. */
async function openGiftOf(db: IteraClient, account: string, toUserId: string): Promise<GiftRow | null> {
  const { data, error } = await db
    .from('gifts')
    .select(GIFT_COLUMNS)
    .eq('source', 'action')
    .eq('from_wallet', account)
    .eq('to_user_id', toUserId)
    .in('status', ['pending', 'expired'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`gifts: ${error.message}`);
  return data as GiftRow | null;
}

async function build(db: IteraClient, wallet: string, request: Request, lang: Lang): Promise<Response> {
  const body = await readJsonObject(request);
  const account = body?.account;
  if (!isSolanaAddress(account)) return refuse('invalid_account', lang, 400);
  if (account === wallet) return refuse('self_gift', lang, 400);

  // A payment whose callback never came is settled first, so this wallet never pays twice for one gift.
  await reconcileGifts(db, { fromWallet: account }, 0);

  const [recipient, item, payer, config] = await Promise.all([loadRecipient(db, wallet, lang), loadItem(db), walletUser(db, account), loadConfig(db)]);
  if (!recipient) return refuse('recipient_not_found', lang, 404);
  if (!item || !isSolanaAddress(config.treasury) || config.treasury === account) return refuse('unavailable', lang, 503);
  const blocked = blockedBy(recipient, payer?.userId ?? null);
  if (blocked) return refuse(blocked, lang, blocked === 'gift_limit' ? 429 : 400);

  let chain: { balance: bigint; blockhash: string; lastValidBlockHeight: number; height: number };
  try {
    const [balance, latest, height] = await Promise.all([balanceOf(account), latestBlockhash(), blockHeight()]);
    chain = { balance, ...latest, height };
  } catch (error) {
    if (!(error instanceof RpcError)) throw error;
    console.error('action-gift rpc failed', error.message);
    return refuse('unavailable', lang, 503);
  }
  const price = BigInt(item.price_lamports);
  if (!fundsCheck(chain.balance, price).ok) return refuse('insufficient_funds', lang, 400);

  const gift = await openGift(db, {
    id: (await openGiftOf(db, account, recipient.userId))?.id,
    source: 'action',
    fromWallet: account,
    fromUserId: payer?.userId ?? null,
    toUserId: recipient.userId,
    toWallet: wallet,
    lamports: item.price_lamports,
    lastValidBlockHeight: chain.lastValidBlockHeight,
    expiresAt: expiresAt(new Date(), chain.height, chain.lastValidBlockHeight),
  });
  const message = buildTransferMessage({ payer: account, recipient: config.treasury, lamports: price, memo: gift.id, recentBlockhash: chain.blockhash });
  return answer(
    giftActionPost({
      lang,
      who: recipient.who,
      transactionBase64: base64Encode(serializeTransaction(message)),
      callbackHref: `${functionsBase()}/${FUNCTION}/confirm?gift=${gift.id}&lang=${lang}`,
    }),
  );
}

/** Action chaining: the client posts the signature here once the wallet sent the transaction. */
async function confirm(db: IteraClient, request: Request, lang: Lang): Promise<Response> {
  const giftId = new URL(request.url).searchParams.get('gift') ?? '';
  const body = await readJsonObject(request);
  const account = body?.account;
  const signature = body?.signature;
  if (!isUuid(giftId) || !isSolanaAddress(account) || !isSignature(signature)) return refuse('invalid_body', lang, 400);
  try {
    const { gift } = await settleActionGift(db, giftId, account, signature, MIRROR_WAIT_MS);
    const recipient = await loadRecipient(db, gift.to_wallet, lang);
    if (!recipient) return refuse('recipient_not_found', lang, 404);
    return answer(giftActionCompleted({ lang, who: recipient.who, icon: recipient.icon, lives: recipient.facts.lives, maxLives: recipient.facts.maxLives }));
  } catch (error) {
    if (!(error instanceof GiftError)) throw error;
    return refuse(error.code, lang, FAILURE_STATUS[error.code]);
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: actionHeaders() });
  const lang = langOf(request, 'en');
  try {
    const [first, ...rest] = pathAfter(request, FUNCTION);
    const db = serviceClient();
    if (first === 'confirm' && rest.length === 0) {
      return request.method === 'POST' ? await confirm(db, request, lang) : refuse('invalid_body', lang, 405);
    }
    const wallet = first ?? new URL(request.url).searchParams.get('to') ?? '';
    if (!isSolanaAddress(wallet) || rest.length > 0) return refuse('invalid_address', lang, 400);
    if (request.method === 'GET') return await describe(db, wallet, lang);
    if (request.method === 'POST') return await build(db, wallet, request, lang);
    return refuse('invalid_body', lang, 405);
  } catch (error) {
    console.error('action-gift failed', error);
    return refuse('unavailable', lang, 500);
  }
});
