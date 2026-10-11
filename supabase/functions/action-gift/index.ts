import { isEd25519Address, isSolanaAddress } from '../_shared/address.ts';
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
  BLIND_EXPIRY_MS,
  SLOT_HOLD_MS,
  actionError,
  actionHeaders,
  actionSlot,
  occupiesSlot,
  giftActionCompleted,
  giftActionGet,
  giftActionPost,
  publicLabel,
  solAmount,
  type GiftErrorCode,
  type Lang,
} from '../_shared/gift.ts';
import { functionsBase, isUuid, langOf, pathAfter, readJsonObject } from '../_shared/http.ts';
import { callerAddress, takeRate, tooMany } from '../_shared/ratelimit.ts';
import { expiresAt, fundsCheck } from '../_shared/purchase-verify.ts';
import { RpcError, balanceOf, blockHeight, latestBlockhash } from '../_shared/rpc.ts';
import { ITEM_COLUMNS, type ShopItem } from '../_shared/shop-items.ts';
import { eligibility } from '../_shared/shop-rules.ts';
import { base64Encode, buildTransferMessage, isSignature, serializeTransaction } from '../_shared/solana-tx.ts';

const FUNCTION = 'action-gift';
const ITEM_KEY = 'life_gift';
/** How long the callback waits for the recipient's companion to be written before answering. */
const MIRROR_WAIT_MS = 6_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** More than the daily cap, so the count of unpaid intents is exact up to it. */
const RECIPIENT_SCAN = 200;
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
  return { wallet, userId: user.userId, who: publicLabel(name, wallet, lang), facts, icon };
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

/**
 * How many Action intents stand open for a recipient from OTHER payers, and how
 * many unpaid ones were opened for them in the last 24 hours. Database only.
 * Rows nobody can pay any more (past the callback's grace window) are closed here.
 */
async function recipientLoad(db: IteraClient, toUserId: string, account: string, now: Date): Promise<{ openOthers: number; unpaidToday: number }> {
  await db
    .from('gifts')
    .update({ status: 'expired' })
    .eq('source', 'action')
    .eq('to_user_id', toUserId)
    .eq('status', 'pending')
    .lt('expires_at', new Date(now.getTime() - BLIND_EXPIRY_MS).toISOString());
  const { data, error } = await db
    .from('gifts')
    .select('from_wallet,status,expires_at')
    .eq('source', 'action')
    .eq('to_user_id', toUserId)
    .in('status', ['pending', 'expired'])
    .gte('created_at', new Date(now.getTime() - DAY_MS).toISOString())
    .limit(RECIPIENT_SCAN);
  if (error) throw new Error(`gifts load: ${error.message}`);
  const rows = (data ?? []) as Array<{ from_wallet: string; status: string; expires_at: string }>;
  return {
    openOthers: rows.filter((row) => row.from_wallet !== account && occupiesSlot(row, now)).length,
    unpaidToday: rows.length,
  };
}

function transactionAnswer(lang: Lang, recipient: Recipient, account: string, treasury: string, gift: GiftRow, blockhash: string): Response {
  const message = buildTransferMessage({ payer: account, recipient: treasury, lamports: BigInt(gift.lamports), memo: gift.id, recentBlockhash: blockhash });
  return answer(
    giftActionPost({
      lang,
      who: recipient.who,
      transactionBase64: base64Encode(serializeTransaction(message)),
      callbackHref: `${functionsBase()}/${FUNCTION}/confirm?gift=${gift.id}&lang=${lang}`,
    }),
  );
}

async function build(db: IteraClient, wallet: string, request: Request, lang: Lang): Promise<Response> {
  const body = await readJsonObject(request);
  const account = body?.account;
  // A payer must be able to sign: an address that is not a real ed25519 public key is refused outright.
  if (!isEd25519Address(account)) return refuse('invalid_account', lang, 400);
  if (account === wallet) return refuse('self_gift', lang, 400);

  // Everything down to the slot decision reads the database only: the Solana node is not asked yet.
  const [recipient, item, payer, config] = await Promise.all([loadRecipient(db, wallet, lang), loadItem(db), walletUser(db, account), loadConfig(db)]);
  if (!recipient) return refuse('recipient_not_found', lang, 404);
  if (!item || !isSolanaAddress(config.treasury) || config.treasury === account) return refuse('unavailable', lang, 503);
  const blocked = blockedBy(recipient, payer?.userId ?? null);
  if (blocked) return refuse(blocked, lang, blocked === 'gift_limit' ? 429 : 400);

  const now = new Date();
  const [own, load] = await Promise.all([openGiftOf(db, account, recipient.userId), recipientLoad(db, recipient.userId, account, now)]);
  const slot = actionSlot({ own, ...load, now });
  if (slot === 'too_many') return refuse('too_many_pending', lang, 429);
  // The payer asked again inside the window of the transaction they already hold: the same one, no node call.
  if (slot === 'reuse' && own?.blockhash) return transactionAnswer(lang, recipient, account, config.treasury, own, own.blockhash);
  // Seconds after an attempt that gave no transaction: the same answer, no node call.
  if (slot === 'wait') return own?.error === 'insufficient_funds' ? refuse('insufficient_funds', lang, 400) : refuse('unavailable', lang, 503);

  // A payment of this wallet whose callback never came is settled first, so it never pays twice for one gift.
  let current = own;
  if (current) {
    await reconcileGifts(db, { fromWallet: account }, 0);
    current = await openGiftOf(db, account, recipient.userId);
  }
  // The intent takes (or keeps) its slot BEFORE the node is asked for anything else, so every node call
  // below belongs to one of the recipient's few open intents, whatever the payer's balance turns out to be.
  const terms = { source: 'action' as const, fromWallet: account, fromUserId: payer?.userId ?? null, toUserId: recipient.userId, toWallet: wallet, lamports: item.price_lamports };
  const held = await openGift(db, { ...terms, id: current?.id, lastValidBlockHeight: null, expiresAt: new Date(now.getTime() + SLOT_HOLD_MS).toISOString() });
  if (held.status !== 'pending') return refuse('unavailable', lang, 503);

  let chain: { balance: bigint; blockhash: string; lastValidBlockHeight: number; height: number };
  try {
    const [balance, latest, height] = await Promise.all([balanceOf(account), latestBlockhash(), blockHeight()]);
    chain = { balance, ...latest, height };
  } catch (error) {
    if (!(error instanceof RpcError)) throw error;
    console.error('action-gift rpc failed', error.message);
    return refuse('unavailable', lang, 503);
  }
  if (!fundsCheck(chain.balance, BigInt(item.price_lamports)).ok) {
    await db.from('gifts').update({ error: 'insufficient_funds' }).eq('id', held.id).eq('status', 'pending');
    return refuse('insufficient_funds', lang, 400);
  }

  const gift = await openGift(db, {
    ...terms,
    id: held.id,
    lastValidBlockHeight: chain.lastValidBlockHeight,
    expiresAt: expiresAt(new Date(), chain.height, chain.lastValidBlockHeight),
    blockhash: chain.blockhash,
  });
  if (gift.status !== 'pending') return refuse('unavailable', lang, 503);
  return transactionAnswer(lang, recipient, account, config.treasury, gift, chain.blockhash);
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

/** The slots per payer and the pending cap live in the table; this one keeps one address from flooding the intent builder. */
const RATE = { limit: 60, windowMs: 60_000 };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: actionHeaders() });
  const lang = langOf(request, 'en');
  try {
    const [first, ...rest] = pathAfter(request, FUNCTION);
    const db = serviceClient();
    const verdict = await takeRate(db, 'action-gift', callerAddress(request), RATE);
    if (!verdict.allowed) return tooMany(verdict, actionHeaders());
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
