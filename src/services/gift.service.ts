/** Gift a life and the invite reward: the `gifts` and `referral` edge functions, plus the gift's price from the shop list. */
import { callShop } from '@/services/shopTransport';
import type { GiftPrice, GiftReceipt, ReferralClaim, ReferralStatus } from '@/types/gift';

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(row) : []);
const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const GIFT_ITEM_KEY = 'life_gift';

/** Null when the block is absent: an ordinary purchase has no gift. */
export function toGift(v: unknown): GiftReceipt | null {
  const r = row(v);
  const id = text(r.id);
  const toWallet = text(row(r.to).wallet);
  if (!id || !toWallet) return null;
  const recipient = row(r.recipient);
  return {
    id,
    fromWallet: text(row(r.from).wallet) ?? '',
    fromName: text(row(r.from).name),
    toWallet,
    toName: text(row(r.to).name),
    recipientLives: int(recipient.lives),
    recipientMax: int(recipient.max_lives) ?? 5,
    companionExplorerUrl: text(recipient.companion_explorer_url),
    paymentExplorerUrl: text(r.payment_explorer_url),
    mirrorSignature: text(r.mirror_tx_signature),
    mirrorExplorerUrl: text(r.mirror_explorer_url),
  };
}

export function toReferralStatus(v: unknown): ReferralStatus {
  const r = row(v);
  const code = text(r.code);
  if (!code) throw new Error('referral: no code in the answer');
  const invited = rows(r.invited).map((e) => ({ status: e.status === 'rewarded' ? ('rewarded' as const) : ('pending' as const), at: text(e.at) ?? '' }));
  const rewardedCount = int(r.rewarded_count) ?? invited.filter((e) => e.status === 'rewarded').length;
  return { code, invited, rewardedCount, pendingCount: int(r.pending_count) ?? invited.length - rewardedCount };
}

/** The gift is not in the shop list: it is asked for by name. Null when it is off sale. */
export async function getGiftPrice(lang: string): Promise<GiftPrice | null> {
  const { data } = await callShop('shop-items', { method: 'GET', query: { lang, with: 'gift' } });
  const item = rows(data).find((r) => r.key === GIFT_ITEM_KEY);
  const priceLabel = text(item?.price_label);
  return item && priceLabel ? { priceLabel, priceLamports: int(item.price_lamports) ?? 0 } : null;
}

/** Gifts the learner received and has not been shown yet. */
export async function getGiftInbox(): Promise<GiftReceipt[]> {
  const { data } = await callShop('gifts', { body: { action: 'inbox' } });
  return rows(row(data).gifts).map(toGift).filter((g): g is GiftReceipt => g !== null);
}

export async function markGiftsSeen(ids: string[]): Promise<void> {
  if (ids.length > 0) await callShop('gifts', { body: { action: 'seen', ids } });
}

export async function getReferralStatus(): Promise<ReferralStatus> {
  const { data } = await callShop('referral', { body: { action: 'status' } });
  return toReferralStatus(data);
}

/** Refusals (own code, old account, already claimed) are answers, not errors. */
export async function claimReferral(code: string): Promise<ReferralClaim> {
  const { data } = await callShop('referral', { body: { action: 'claim', code } });
  const r = row(data);
  return { claimed: r.claimed === true, reason: text(r.reason) };
}
