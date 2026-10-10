import { isSolanaAddress } from './address.ts';
import { ensureCompanion, grantLifeOnce, syncMirror } from './companion-store.ts';
import { explorerUrl, type ChainWrite } from './credential.ts';
import { loadConfig, type IteraClient } from './db.ts';
import { cleanName, giftPhase } from './gift.ts';
import { BONUS_LIVES, regenerate } from './lives.ts';
import { missingTransactionVerdict, verifyPayment, type ParsedTransaction } from './purchase-verify.ts';
import { RpcError, blockHeight, rpc } from './rpc.ts';

export const GIFT_COLUMNS =
  'id,source,from_wallet,from_user_id,to_user_id,to_wallet,lamports,status,tx_signature,mirror_signature,last_valid_block_height,expires_at,created_at,paid_at,delivered_at,seen_at';
const UNIQUE_VIOLATION = '23505';
const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKUP_ATTEMPTS = 6;
const LOOKUP_PAUSE_MS = 1_000;

export interface GiftRow {
  id: string;
  source: 'app' | 'action';
  from_wallet: string;
  from_user_id: string | null;
  to_user_id: string;
  to_wallet: string;
  lamports: number;
  status: 'pending' | 'paid' | 'delivered' | 'expired';
  tx_signature: string | null;
  mirror_signature: string | null;
  last_valid_block_height: number | null;
  expires_at: string;
  created_at: string;
  paid_at: string | null;
  delivered_at: string | null;
  seen_at: string | null;
}

export type GiftFailure =
  | 'gift_not_found'
  | 'gift_expired'
  | 'payer_mismatch'
  | 'tx_not_found'
  | 'tx_failed'
  | 'payment_mismatch'
  | 'signature_reused'
  | 'unavailable';

export class GiftError extends Error {
  constructor(readonly code: GiftFailure) {
    super(code);
  }
}

export interface WalletUser {
  userId: string;
  /** `identity`: the wallet signs in as this learner. `linked`: an e-mail account bound it. */
  source: 'identity' | 'linked';
}

/** The learner behind a wallet address: its sign-in account first, else the account that linked it. */
export async function walletUser(db: IteraClient, wallet: string): Promise<WalletUser | null> {
  if (!isSolanaAddress(wallet)) return null;
  const [identity, linked] = await Promise.all([
    db.rpc('wallet_identity_user', { p_address: wallet }),
    db.from('user_wallets').select('user_id').eq('wallet', wallet).maybeSingle(),
  ]);
  if (identity.error) throw new Error(`wallet_identity_user: ${identity.error.message}`);
  if (linked.error) throw new Error(`user_wallets: ${linked.error.message}`);
  if (typeof identity.data === 'string') return { userId: identity.data, source: 'identity' };
  return linked.data ? { userId: linked.data.user_id, source: 'linked' } : null;
}

/**
 * The nickname a wallet learner chose at sign-in, the only name shown in
 * public. An e-mail account's display name may be a real name: never returned.
 */
export async function publicNameOf(db: IteraClient, user: WalletUser | null): Promise<string | null> {
  if (!user || user.source !== 'identity') return null;
  const { data, error } = await db.from('users').select('display_name').eq('id', user.userId).maybeSingle();
  if (error) throw new Error(`users: ${error.message}`);
  return cleanName(data?.display_name);
}

export interface RecipientFacts {
  companionId: string;
  companionVersion: number;
  outfit: string | null;
  lives: number;
  maxLives: number;
  bonusLives: number;
  giftsReceivedToday: number;
}

/** What decides whether a learner can receive a gift right now. Creates the companion row on first use. */
export async function recipientFacts(db: IteraClient, userId: string, now: Date): Promise<RecipientFacts> {
  const [row, received] = await Promise.all([
    ensureCompanion(db, userId),
    db
      .from('gifts')
      .select('id', { count: 'exact', head: true })
      .eq('to_user_id', userId)
      .in('status', ['paid', 'delivered'])
      .gte('paid_at', new Date(now.getTime() - DAY_MS).toISOString()),
  ]);
  if (received.error) throw new Error(`gifts count: ${received.error.message}`);
  const { lives, maxLives } = regenerate({ lives: row.lives, maxLives: row.max_lives, lastRegenAt: row.last_regen_at }, now);
  return {
    companionId: row.id,
    companionVersion: row.version,
    outfit: row.outfit,
    lives,
    maxLives,
    bonusLives: BONUS_LIVES,
    giftsReceivedToday: received.count ?? 0,
  };
}

export async function loadGift(db: IteraClient, id: string): Promise<GiftRow | null> {
  const { data, error } = await db.from('gifts').select(GIFT_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(`gifts: ${error.message}`);
  return data as GiftRow | null;
}

export interface GiftTerms {
  /** Set for the in-app path: the gift shares its id with the purchase intent. */
  id?: string;
  source: 'app' | 'action';
  fromWallet: string;
  fromUserId: string | null;
  toUserId: string;
  toWallet: string;
  lamports: number;
  lastValidBlockHeight: number;
  expiresAt: string;
}

/**
 * Opens a gift intent. With an `id` (the in-app path, where a repeated purchase
 * intent keeps its id) an unpaid row is refreshed with the new blockhash window
 * instead; a paid one is left alone.
 */
export async function openGift(db: IteraClient, terms: GiftTerms): Promise<GiftRow> {
  const window = {
    from_wallet: terms.fromWallet,
    from_user_id: terms.fromUserId,
    to_wallet: terms.toWallet,
    last_valid_block_height: terms.lastValidBlockHeight,
    expires_at: terms.expiresAt,
  };
  if (terms.id) {
    const { data: refreshed, error: refreshError } = await db
      .from('gifts')
      .update({ ...window, status: 'pending', error: null })
      .eq('id', terms.id)
      .in('status', ['pending', 'expired'])
      .select(GIFT_COLUMNS)
      .maybeSingle();
    if (refreshError) throw new Error(`gifts refresh: ${refreshError.message}`);
    if (refreshed) return refreshed as GiftRow;
  }
  const { data, error } = await db
    .from('gifts')
    .insert({ ...(terms.id ? { id: terms.id } : {}), ...window, source: terms.source, to_user_id: terms.toUserId, lamports: terms.lamports })
    .select(GIFT_COLUMNS)
    .single();
  if (data) return data as GiftRow;
  if (error?.code === UNIQUE_VIOLATION && terms.id) {
    const existing = await loadGift(db, terms.id);
    if (existing) return existing;
  }
  throw new Error(`gifts insert: ${error?.message}`);
}

export interface Delivery {
  gift: GiftRow;
  /** The write of the recipient's companion asset this call confirmed, when it made one. */
  write: ChainWrite | null;
}

/**
 * Lands a paid gift: records the payment once, gives the life once and brings
 * the recipient's companion asset up to date. Safe to repeat for the same gift
 * and signature; never gives a second life.
 */
export async function deliverGift(db: IteraClient, row: GiftRow, signature: string, mirrorWaitMs: number): Promise<Delivery> {
  let gift = row;
  if (gift.status === 'pending' || gift.status === 'expired') {
    const { data, error } = await db
      .from('gifts')
      .update({ status: 'paid', tx_signature: signature, paid_at: new Date().toISOString(), error: null })
      .eq('id', gift.id)
      .in('status', ['pending', 'expired'])
      .select(GIFT_COLUMNS)
      .maybeSingle();
    if (error?.code === UNIQUE_VIOLATION) throw new GiftError('signature_reused');
    if (error) throw new Error(`gifts pay: ${error.message}`);
    gift = (data as GiftRow | null) ?? ((await loadGift(db, gift.id)) as GiftRow);
  }
  if (gift.tx_signature !== signature) throw new GiftError('signature_reused');

  await grantLifeOnce(db, gift.to_user_id, `gift:${gift.id}`, 'gift');

  // Delivered as soon as the life is there: the chain write below can take seconds and repairs itself.
  const patch = async (values: Record<string, unknown>): Promise<GiftRow> => {
    const { data, error } = await db.from('gifts').update(values).eq('id', gift.id).select(GIFT_COLUMNS).single();
    if (error) throw new Error(`gifts deliver: ${error.message}`);
    return data as GiftRow;
  };
  if (gift.status !== 'delivered') gift = await patch({ status: 'delivered', delivered_at: new Date().toISOString() });

  let write: ChainWrite | null = null;
  if (!gift.mirror_signature) {
    write = (await syncMirror(db, gift.to_user_id, mirrorWaitMs)).write;
    if (write) gift = await patch({ mirror_signature: write.signature });
  }
  return { gift, write };
}

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

/**
 * Settles a gift opened through the Action against a transaction signature:
 * the same checks `purchase-confirm` makes (payer, treasury, amount, memo, all
 * read from chain), then the delivery. Throws `GiftError` with the reason.
 */
export async function settleActionGift(db: IteraClient, giftId: string, account: string, signature: string, mirrorWaitMs: number): Promise<Delivery> {
  const gift = await loadGift(db, giftId);
  if (!gift || gift.source !== 'action') throw new GiftError('gift_not_found');
  if (gift.from_wallet !== account) throw new GiftError('payer_mismatch');

  const phase = giftPhase(gift, new Date());
  if (phase === 'expired') throw new GiftError('gift_expired');
  if (phase === 'payable') {
    const { treasury } = await loadConfig(db);
    if (!isSolanaAddress(treasury)) throw new GiftError('unavailable');
    let transaction: ParsedTransaction | null;
    try {
      transaction = await findTransaction(signature);
      if (!transaction) {
        const verdict = missingTransactionVerdict(await blockHeight(), gift.last_valid_block_height);
        throw new GiftError(verdict === 'intent_expired' ? 'gift_expired' : 'tx_not_found');
      }
    } catch (error) {
      if (!(error instanceof RpcError)) throw error;
      console.error('gift lookup rpc failed', error.message);
      throw new GiftError('unavailable');
    }
    const payment = verifyPayment(transaction, { wallet: gift.from_wallet, treasury, lamports: BigInt(gift.lamports), memo: gift.id });
    if (!payment.ok) throw new GiftError(payment.error === 'tx_failed' ? 'tx_failed' : 'payment_mismatch');
  }
  return deliverGift(db, gift, signature, mirrorWaitMs);
}

/** A gift as both sides see it. Names are public nicknames or `null`; nothing else identifies a learner. */
export async function giftView(db: IteraClient, gift: GiftRow) {
  const [fromUser, toUser, companion] = await Promise.all([
    walletUser(db, gift.from_wallet),
    walletUser(db, gift.to_wallet),
    ensureCompanion(db, gift.to_user_id),
  ]);
  const [fromName, toName] = await Promise.all([
    publicNameOf(db, fromUser?.userId === gift.from_user_id ? fromUser : null),
    publicNameOf(db, toUser?.userId === gift.to_user_id ? toUser : null),
  ]);
  const { lives, maxLives } = regenerate({ lives: companion.lives, maxLives: companion.max_lives, lastRegenAt: companion.last_regen_at }, new Date());
  return {
    id: gift.id,
    source: gift.source,
    status: gift.status,
    from: { wallet: gift.from_wallet, name: fromName },
    to: { wallet: gift.to_wallet, name: toName },
    recipient: {
      lives,
      max_lives: maxLives,
      companion_asset: companion.asset_address,
      companion_explorer_url: explorerUrl('address', companion.asset_address),
    },
    payment_explorer_url: explorerUrl('tx', gift.tx_signature),
    mirror_tx_signature: gift.mirror_signature,
    mirror_explorer_url: explorerUrl('tx', gift.mirror_signature),
    delivered_at: gift.delivered_at,
    seen_at: gift.seen_at,
  };
}
