import { callerFailureStatus, resolveCaller } from '../_shared/caller.ts';
import {
  claimMint,
  companionResponse,
  ensureCompanion,
  inBackground,
  loadInventory,
  loadStats,
  mintCompanion,
  setAvatar,
  setOutfit,
  syncMirror,
} from '../_shared/companion-store.ts';
import { avatarBlock, loadAvatarCatalog, ownedAvatarKeys } from '../_shared/avatar-store.ts';
import { equipVerdict, isAvatarKey, isFreeAvatar } from '../_shared/avatars.ts';
import { isOutfit } from '../_shared/cosmetics.ts';
import { serviceClient, type IteraClient } from '../_shared/db.ts';
import { PURCHASE_EQUIP_WINDOW_MS, type MirrorReason } from '../_shared/mirror.ts';
import { reconcileGiftsWithin } from '../_shared/gift-reconcile.ts';
import { corsHeaders, json, readJsonObject } from '../_shared/http.ts';

const GIFT_RECONCILE_BUDGET_MS = 4_000;

/** The learner paid for (or claimed) this outfit within the last few minutes. */
async function boughtRecently(db: IteraClient, userId: string, itemKey: string): Promise<boolean> {
  const { data, error } = await db
    .from('purchases')
    .select('id')
    .eq('user_id', userId)
    .eq('item_key', itemKey)
    .eq('status', 'paid')
    .gte('paid_at', new Date(Date.now() - PURCHASE_EQUIP_WINDOW_MS).toISOString())
    .limit(1);
  if (error) throw new Error(`purchases recent: ${error.message}`);
  return (data ?? []).length > 0;
}

/** `undefined`: no equip requested. `false`: malformed. Otherwise the outfit to wear (`null` takes it off). */
function equipOf(body: Record<string, unknown>): string | null | undefined | false {
  if (body.equip === undefined) return undefined;
  if (!body.equip || typeof body.equip !== 'object' || Array.isArray(body.equip)) return false;
  const { outfit, avatar } = body.equip as Record<string, unknown>;
  // `{ equip: { avatar } }` alone leaves the outfit as it is.
  if (outfit === undefined) return avatar === undefined ? false : undefined;
  if (outfit === null) return null;
  return typeof outfit === 'string' && outfit.length <= 64 ? outfit : false;
}

/** `undefined`: no avatar change requested. `false`: malformed. Otherwise the avatar key to wear. */
function equipAvatarOf(body: Record<string, unknown>): string | undefined | false {
  if (!body.equip || typeof body.equip !== 'object' || Array.isArray(body.equip)) return undefined;
  const { avatar } = body.equip as Record<string, unknown>;
  if (avatar === undefined) return undefined;
  return isAvatarKey(avatar) ? avatar : false;
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const db = serviceClient();
    // The body is read while the caller is resolved: neither waits for the other.
    const [caller, body] = await Promise.all([resolveCaller(db, request), readJsonObject(request)]);
    if (typeof caller === 'string') return json({ error: caller }, callerFailureStatus(caller), cors);
    const equip = body ? equipOf(body) : false;
    const equipAvatar = body ? equipAvatarOf(body) : false;
    if (!body || equip === false || equipAvatar === false) return json({ error: 'invalid_body' }, 400, cors);
    const lang = body.lang === 'en' ? 'en' : 'pt';

    const userId = caller.iteraUserId;
    // A gift whose confirm never arrived lands here, before the lives are read.
    await reconcileGiftsWithin(db, { toUserId: userId }, GIFT_RECONCILE_BUDGET_MS);
    let row = await ensureCompanion(db, userId);
    let mirrorWanted = row.mirror_due;
    let mirrorReason: MirrorReason = 'routine';

    if (equip !== undefined && equip !== row.outfit) {
      if (equip !== null) {
        const owned = isOutfit(equip) && (await loadInventory(db, userId, row.outfit)).some((entry) => entry.item_key === equip);
        if (!owned) return json({ error: 'not_owned' }, 409, cors);
        // Putting on what was just bought (or claimed) is part of the purchase: it skips the mirror cooldown.
        if (await boughtRecently(db, userId, equip)) mirrorReason = 'purchase';
      }
      row = await setOutfit(db, userId, equip);
      mirrorWanted = true;
    }

    // A free avatar is everyone's; a collectible needs the learner's own paid row (on-chain transfers are not tracked).
    if (equipAvatar !== undefined && equipAvatar !== row.avatar) {
      const item = (await loadAvatarCatalog(db)).items.get(equipAvatar);
      const owned = item && !isFreeAvatar(item) ? new Set((await ownedAvatarKeys(db, userId)).keys()) : new Set<string>();
      const verdict = equipVerdict(item, owned);
      // An avatar that is not in the catalog is, to the caller, one they do not have.
      if (!verdict.ok) return json({ error: 'not_owned' }, 409, cors);
      if (item && !isFreeAvatar(item) && (await boughtRecently(db, userId, equipAvatar))) mirrorReason = 'purchase';
      row = await setAvatar(db, userId, equipAvatar);
      mirrorWanted = true;
    }

    // The mint outlives the response: the caller sees `pending` now and polls.
    if (caller.wallet && row.mint_status !== 'minted' && (await claimMint(db, userId, caller.wallet))) {
      row = { ...row, mint_status: 'pending' };
      inBackground(mintCompanion(db, userId, caller.wallet));
    } else if (mirrorWanted && row.mint_status === 'minted') {
      inBackground(syncMirror(db, userId, 0, mirrorReason));
    }

    const now = new Date();
    const [stats, inventory, avatar] = await Promise.all([
      loadStats(db, userId, now),
      loadInventory(db, userId, row.outfit),
      avatarBlock(db, userId, row.avatar, lang),
    ]);
    return json({ ...companionResponse(row, stats, now), avatar, inventory, wallet: caller.wallet }, 200, cors);
  } catch (error) {
    console.error('companion failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
