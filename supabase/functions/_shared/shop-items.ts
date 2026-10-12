import { avatarImageUrl, includesOf, isEarnOnly, isFreeAvatar, isOwnedRow, isSoldOut, reservationUntil, tierName, type AvatarAssetRow } from './avatars.ts';
import { loadAvatarCatalog, loadAvatarRow, loadSupply, mintAvatar, reserve, supabaseUrl } from './avatar-store.ts';
import { GLOBAL_REF } from './awards.ts';
import { withClaims } from './claims.ts';
import { claimsByRow } from './claims-store.ts';
import { changeLives, ensureCompanion, syncMirror } from './companion-store.ts';
import { cosmeticsFromPurchases, cosmeticsOf, sameCosmetics } from './cosmetics.ts';
import { trailCosmeticPurchases } from './cosmetics-store.ts';
import { changedAttributes, explorerUrl, onchainAttributes, pickText, type AchievementRow, type CatalogEntry, type ChainWrite } from './credential.ts';
import { CATALOG_COLUMNS, ROW_COLUMNS, loadConfig, type IteraClient } from './db.ts';
import { deliverGift, loadGift, recipientFacts, type GiftRow } from './gift-store.ts';
import { applyLifePack, lifePackOf, refillLives, regenerate, type LifePack } from './lives.ts';
import { inSeason, seasonData } from './seasons.ts';
import { eligibility, type Eligibility, type EligibilityFacts, type ItemKind } from './shop-rules.ts';

export const ITEM_COLUMNS = 'key,kind,price_lamports,price_usd_cents,price_label,title_i18n,description_i18n,effect,art,active,sort,price_crystals,sol_enabled,crystals_enabled';
export const PURCHASE_COLUMNS =
  'id,user_id,item_key,ref_id,lamports,price_usd_cents,status,wallet,tx_signature,memo,last_valid_block_height,expires_at,paid_at,applied_at,refund_due_at';

export interface ShopItem {
  key: string;
  kind: string;
  /** Missing (`null` in the table) only on an item that is not for sale: a free avatar. `purchase-intent` refuses those first. */
  price_lamports: number;
  price_usd_cents: number;
  price_label: string;
  title_i18n: Record<string, string>;
  description_i18n: Record<string, string>;
  effect: Record<string, unknown>;
  art: Record<string, unknown>;
  active: boolean;
  sort: number;
  /** What the item costs in Phoenix Crystals; `null`: not sold for crystals. */
  price_crystals?: number | null;
  /** The item's own currency switches (`shop_accept` is the global one); a missing flag reads as on. */
  sol_enabled?: boolean;
  crystals_enabled?: boolean;
}

export interface PurchaseRow {
  id: string;
  user_id: string;
  item_key: string;
  ref_id: string;
  lamports: number;
  price_usd_cents: number;
  status: 'pending' | 'paid' | 'refunded' | 'failed' | 'expired';
  wallet: string;
  tx_signature: string | null;
  memo: string;
  last_valid_block_height: number | null;
  expires_at: string;
  paid_at: string | null;
  applied_at: string | null;
  /** Paid, but the thing could not be given (see `ApplyRefusal`): the operator owes a refund. */
  refund_due_at?: string | null;
}

export interface ShopContext {
  db: IteraClient;
  userId: string;
  item: ShopItem;
  refId: string;
}

export interface ApplyContext extends ShopContext {
  purchase: PurchaseRow;
}

/** What an applied item touched, so the response can carry the refreshed pieces. */
export interface ApplyOutcome {
  companion: boolean;
  passport: AchievementRow | null;
  /** The asset write this call made, when it made one. */
  chain: ChainWrite | null;
  /** A gift this purchase delivered: the answer then describes the recipient, not the payer. */
  gift?: GiftRow;
  /** A collectible avatar this purchase minted (or had minted already). */
  avatar?: { key: string; title_i18n: Record<string, string>; tier_name_i18n: Record<string, string>; asset_address: string | null; image_url: string; thumb_url: string; serial: number; includes: Array<{ key: string; kind: string; title_i18n: Record<string, string> }> };
}

/**
 * The payment is good but the item can no longer be given, for ever (the last
 * unit of a limited avatar went to somebody else). Not retryable: the purchase
 * is flagged `refund_due_at` and the buyer is told so, never left to guess.
 */
export class ApplyRefusal extends Error {
  constructor(public readonly code: 'sold_out_after_payment' | 'already_owned_after_payment') {
    super(code);
  }
}

export interface ItemHandler {
  canBuy(context: ShopContext): Promise<Eligibility>;
  /**
   * Runs once the intent row exists and the wallet is known to hold the price:
   * where a kind takes what is scarce (an avatar's serial). A refusal retires the intent.
   */
  afterIntent?(context: ShopContext, intent: PurchaseRow): Promise<Eligibility>;
  /** Idempotent: applying a paid purchase again leaves the same state. Throws when the effect is still due. */
  apply(context: ApplyContext): Promise<ApplyOutcome>;
}

/** How long a refill waits for a mirror already in flight before leaving the write to its holder. */
const REFILL_MIRROR_WAIT_MS = 6_000;
/** Same patience for a gift: the payer is shown the write of the recipient's companion. */
const GIFT_MIRROR_WAIT_MS = 6_000;
const NO_FACTS: Omit<EligibilityFacts, 'refId'> = { lives: 0, maxLives: 0, owned: false, passportMinted: false };

async function owns({ db, userId, item, refId }: ShopContext): Promise<boolean> {
  const { data, error } = await db
    .from('user_inventory')
    .select('qty')
    .eq('user_id', userId)
    .eq('item_key', item.key)
    .eq('ref_id', refId)
    .gt('qty', 0)
    .maybeSingle();
  if (error) throw new Error(`user_inventory: ${error.message}`);
  return data !== null;
}

async function grant({ db, userId, item, refId }: ShopContext): Promise<void> {
  const { error } = await db
    .from('user_inventory')
    .upsert({ user_id: userId, item_key: item.key, ref_id: refId, qty: 1, updated_at: new Date().toISOString() });
  if (error) throw new Error(`user_inventory grant: ${error.message}`);
}

async function loadPassport({ db, userId, refId }: ShopContext): Promise<AchievementRow | null> {
  const { data, error } = await db
    .from('user_achievements')
    .select(ROW_COLUMNS)
    .eq('user_id', userId)
    .eq('achievement_key', 'trail_pass')
    .eq('ref_id', refId)
    .maybeSingle();
  if (error) throw new Error(`user_achievements: ${error.message}`);
  const row = data as AchievementRow | null;
  // The proven claims ride in `state` for the chain write, as in `restoreCosmetics`: a cosmetic must not drop them from the asset.
  return row && withClaims(row, (await claimsByRow(db, [row.id])).get(row.id) ?? []);
}

/** A passport cosmetic: stored on the `trail_pass` row and written to the asset's attributes. */
const passportCosmetic = (kind: 'ink' | 'frame'): ItemHandler => ({
  async canBuy(context) {
    if (context.refId === GLOBAL_REF) return eligibility(kind, { ...NO_FACTS, refId: context.refId });
    const [passport, owned] = await Promise.all([loadPassport(context), owns(context)]);
    const passportMinted = passport?.mint_status === 'minted' && Boolean(passport.asset_address);
    return eligibility(kind, { ...NO_FACTS, refId: context.refId, owned, passportMinted });
  },
  async apply(context) {
    const { db, purchase } = context;
    const [passport, purchases] = await Promise.all([loadPassport(context), trailCosmeticPurchases(db, context.userId, context.refId)]);
    if (!passport || passport.mint_status !== 'minted' || !passport.asset_address) throw new Error('passport is not minted');
    const wanted = cosmeticsFromPurchases(purchases);
    if (purchase.applied_at && sameCosmetics(cosmeticsOf(passport.state), wanted)) return { companion: false, passport, chain: null };

    const updated: AchievementRow = { ...passport, state: { ...passport.state, cosmetics: wanted } };
    const { error } = await db.from('user_achievements').update({ state: updated.state }).eq('id', passport.id);
    if (error) throw new Error(`user_achievements cosmetics: ${error.message}`);

    const [{ data: catalog, error: catalogError }, config] = await Promise.all([
      db.from('achievements').select(CATALOG_COLUMNS).eq('key', 'trail_pass').single(),
      loadConfig(db),
    ]);
    if (catalogError) throw new Error(`achievements: ${catalogError.message}`);
    if (!config.collection_passports) throw new Error('passports collection is not configured');
    const sdk = await import('./chain.ts');
    const attributes = onchainAttributes(updated, catalog as CatalogEntry);
    const signature = await sdk.updateCredentialAttributes(sdk.loadChain(), {
      asset: passport.asset_address,
      collection: config.collection_passports,
      attributes,
    });
    await grant(context);
    const chain: ChainWrite = {
      asset: passport.asset_address,
      signature,
      at: new Date().toISOString(),
      attributes,
      changed: changedAttributes(onchainAttributes(passport, catalog as CatalogEntry), attributes),
    };
    return { companion: false, passport: updated, chain };
  },
});

/** A theme item: nobody buys what everybody has (the default), then owned once. */
const themeItem = (kind: 'border' | 'background' | 'app_icon'): ItemHandler => ({
  async canBuy(context) {
    if (context.refId !== GLOBAL_REF) return eligibility(kind, { ...NO_FACTS, refId: context.refId });
    if (context.item.effect?.default === true) return { ok: false, error: 'already_owned' };
    return eligibility(kind, { ...NO_FACTS, refId: context.refId, owned: await owns(context) });
  },
  async apply(context) {
    await grant(context);
    return { companion: false, passport: null, chain: null };
  },
});

/** A life pack, exactly once per purchase: the event row is the lock, dropped again if the change fails. */
async function applyPackOnce(db: IteraClient, userId: string, purchaseId: string, pack: LifePack): Promise<void> {
  const attemptId = `purchase:${purchaseId}`;
  const { data, error } = await db
    .from('life_events')
    .upsert({ user_id: userId, attempt_id: attemptId, kind: 'refill', applied_at: new Date().toISOString() }, { onConflict: 'user_id,attempt_id', ignoreDuplicates: true })
    .select('id');
  if (error) throw new Error(`life_events: ${error.message}`);
  if ((data ?? []).length === 0) return;
  try {
    await changeLives(db, userId, (state, now) => applyLifePack(state, pack, now));
  } catch (failure) {
    await db.from('life_events').delete().eq('user_id', userId).eq('attempt_id', attemptId);
    throw failure;
  }
}

/**
 * One handler per item kind. A new kind is one entry here plus its rule in
 * `shop-rules.ts`.
 */
export const ITEM_HANDLERS: Record<ItemKind, ItemHandler> = {
  life: {
    async canBuy({ db, userId, item, refId }) {
      // A pack adds lives (or switches losing off): there is always room for it.
      if (lifePackOf(item.effect)) return refId === GLOBAL_REF ? { ok: true } : { ok: false, error: 'invalid_ref' };
      const row = await ensureCompanion(db, userId);
      const { lives, maxLives } = regenerate({ lives: row.lives, maxLives: row.max_lives, lastRegenAt: row.last_regen_at }, new Date());
      return eligibility('life', { ...NO_FACTS, refId, lives, maxLives });
    },
    async apply({ db, userId, item, purchase }) {
      const pack = lifePackOf(item.effect);
      if (pack && !purchase.applied_at) await applyPackOnce(db, userId, purchase.id, pack);
      else if (!purchase.applied_at) {
        await changeLives(db, userId, refillLives);
        const { error } = await db
          .from('life_events')
          .upsert(
            { user_id: userId, attempt_id: `purchase:${purchase.id}`, kind: 'refill', applied_at: new Date().toISOString() },
            { onConflict: 'user_id,attempt_id', ignoreDuplicates: true },
          );
        if (error) throw new Error(`life_events: ${error.message}`);
      }
      // The refill is the proof the buyer waits for: take the mirror even if a write is in flight.
      const mirror = await syncMirror(db, userId, REFILL_MIRROR_WAIT_MS, 'purchase');
      return { companion: true, passport: null, chain: mirror.write };
    },
  },
  outfit: {
    async canBuy(context) {
      if (context.refId !== GLOBAL_REF) return eligibility('outfit', { ...NO_FACTS, refId: context.refId });
      return eligibility('outfit', { ...NO_FACTS, refId: context.refId, owned: await owns(context) });
    },
    async apply(context) {
      await grant(context);
      return { companion: true, passport: null, chain: null };
    },
  },
  ink: passportCosmetic('ink'),
  frame: passportCosmetic('frame'),
  // `refId` is the recipient's user id; `purchase-intent` resolved it from the wallet address it was given.
  gift: {
    async canBuy({ db, userId, refId }) {
      if (refId === GLOBAL_REF || refId === userId) return eligibility('gift', { ...NO_FACTS, refId, payerId: userId });
      const facts = await recipientFacts(db, refId, new Date());
      return eligibility('gift', { ...NO_FACTS, ...facts, refId, payerId: userId });
    },
    async apply({ db, purchase }) {
      const gift = await loadGift(db, purchase.id);
      if (!gift) throw new Error('gift row is missing for this purchase');
      if (!purchase.tx_signature) throw new Error('gift purchase has no payment signature');
      const delivery = await deliverGift(db, gift, purchase.tx_signature, GIFT_MIRROR_WAIT_MS);
      return { companion: false, passport: null, chain: delivery.write, gift: delivery.gift };
    },
  },
  // A profile border, a background or an app icon colour: global, owned once, worn through `POST /crystals/equip`.
  border: themeItem('border'),
  background: themeItem('background'),
  app_icon: themeItem('app_icon'),
  // A collectible avatar: one per learner, a serial out of a (possibly limited) supply, minted to the buyer's wallet.
  avatar: {
    async canBuy({ db, userId, item, refId }) {
      if (refId !== GLOBAL_REF) return eligibility('avatar', { ...NO_FACTS, refId });
      const catalog = await loadAvatarCatalog(db, true);
      const avatar = catalog.items.get(item.key);
      if (!avatar || isFreeAvatar(avatar)) return eligibility('avatar', { ...NO_FACTS, refId, free: true });
      // Whatever `active` says: a tier that is earned is not sold through any door.
      if (isEarnOnly(catalog, avatar)) return eligibility('avatar', { ...NO_FACTS, refId, earnOnly: true });
      const [own, supply] = await Promise.all([loadAvatarRow(db, userId, item.key), loadSupply(db)]);
      const holding = own?.mint_status === 'reserved' && own.reserved_until !== null && Date.parse(own.reserved_until) > Date.now();
      return eligibility('avatar', { ...NO_FACTS, refId, owned: isOwnedRow(own), outOfSeason: !inSeason(seasonData(avatar.effect), new Date()), soldOut: !holding && isSoldOut(avatar, supply.get(item.key)) });
    },
    // The serial is held from here until the intent's window ends (plus a grace), so the buyer who pays gets a unit.
    async afterIntent({ db, userId, item }, intent) {
      const avatar = (await loadAvatarCatalog(db)).items.get(item.key);
      if (!avatar) return { ok: false, error: 'free_item' };
      const result = await reserve(db, { userId, item: avatar, purchaseId: intent.id, paid: false, until: reservationUntil(intent.expires_at), now: new Date() });
      if (result.status === 'reserved') return { ok: true };
      return { ok: false, error: result.status === 'owned' ? 'already_owned' : result.status };
    },
    async apply({ db, userId, item, purchase }) {
      if (purchase.refund_due_at) throw new ApplyRefusal('sold_out_after_payment');
      const catalog = await loadAvatarCatalog(db);
      const avatar = catalog.items.get(item.key);
      if (!avatar || isFreeAvatar(avatar)) throw new Error(`avatar ${item.key} is not for sale`);
      let own: AvatarAssetRow | null = await loadAvatarRow(db, userId, item.key);
      if (!own || own.mint_status === 'reserved') {
        // Paid: the hold becomes the learner's unit. A hold that lapsed and was handed on is taken again if any unit is left.
        const now = new Date();
        const result = await reserve(db, { userId, item: avatar, purchaseId: purchase.id, paid: true, until: now, now });
        if (result.status !== 'reserved' && result.status !== 'owned') throw new ApplyRefusal('sold_out_after_payment');
        own = result.row;
      }
      if (own.purchase_id !== purchase.id) throw new ApplyRefusal('already_owned_after_payment');
      const minted = await mintAvatar(db, catalog, avatar, own, purchase.wallet);
      // What the avatar carries with it (its signature border, glasses...) is the learner's in the same step; granting again changes nothing.
      const includes = includesOf(avatar.effect).flatMap((key) => {
        const included = catalog.included?.get(key);
        return included ? [included] : [];
      });
      for (const included of includes) await grant({ db, userId, item: { key: included.key } as ShopItem, refId: GLOBAL_REF });
      return {
        companion: false,
        passport: null,
        chain: null,
        avatar: {
          key: avatar.key,
          title_i18n: avatar.title_i18n,
          tier_name_i18n: { pt: tierName(catalog, avatar, 'pt'), en: tierName(catalog, avatar, 'en') },
          asset_address: minted.asset_address,
          image_url: avatarImageUrl(supabaseUrl(), avatar),
          thumb_url: avatarImageUrl(supabaseUrl(), avatar, '128'),
          serial: minted.serial,
          includes: includes.map(({ key, kind, title_i18n }) => ({ key, kind, title_i18n })),
        },
      };
    },
  },
};

/** The `avatar` block of a paid answer. */
export function purchasedAvatarView(avatar: NonNullable<ApplyOutcome['avatar']>, lang: 'pt' | 'en') {
  return {
    key: avatar.key,
    title: pickText(avatar.title_i18n, lang),
    tier_name: pickText(avatar.tier_name_i18n, lang),
    asset_address: avatar.asset_address,
    explorer_url: explorerUrl('address', avatar.asset_address),
    image_url: avatar.image_url,
    thumb_url: avatar.thumb_url,
    serial: avatar.serial,
    includes: avatar.includes.map(({ key, kind, title_i18n }) => ({ key, kind, title: pickText(title_i18n, lang) || key })),
  };
}
