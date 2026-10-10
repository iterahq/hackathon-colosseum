import { GLOBAL_REF } from './awards.ts';
import { changeLives, ensureCompanion, syncMirror } from './companion-store.ts';
import { cosmeticsFromPurchases, cosmeticsOf, sameCosmetics } from './cosmetics.ts';
import { trailCosmeticPurchases } from './cosmetics-store.ts';
import { changedAttributes, onchainAttributes, type AchievementRow, type CatalogEntry, type ChainWrite } from './credential.ts';
import { CATALOG_COLUMNS, ROW_COLUMNS, loadConfig, type IteraClient } from './db.ts';
import { deliverGift, loadGift, recipientFacts, type GiftRow } from './gift-store.ts';
import { refillLives, regenerate } from './lives.ts';
import { eligibility, type Eligibility, type EligibilityFacts, type ItemKind } from './shop-rules.ts';

export const ITEM_COLUMNS = 'key,kind,price_lamports,price_usd_cents,price_label,title_i18n,description_i18n,effect,art,active,sort';
export const PURCHASE_COLUMNS =
  'id,user_id,item_key,ref_id,lamports,price_usd_cents,status,wallet,tx_signature,memo,last_valid_block_height,expires_at,paid_at,applied_at';

export interface ShopItem {
  key: string;
  kind: string;
  price_lamports: number;
  price_usd_cents: number;
  price_label: string;
  title_i18n: Record<string, string>;
  description_i18n: Record<string, string>;
  effect: Record<string, unknown>;
  art: Record<string, unknown>;
  active: boolean;
  sort: number;
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
}

export interface ItemHandler {
  canBuy(context: ShopContext): Promise<Eligibility>;
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
  return data as AchievementRow | null;
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

/**
 * One handler per item kind. A new kind is one entry here plus its rule in
 * `shop-rules.ts`.
 */
export const ITEM_HANDLERS: Record<ItemKind, ItemHandler> = {
  life: {
    async canBuy({ db, userId, refId }) {
      const row = await ensureCompanion(db, userId);
      const { lives, maxLives } = regenerate({ lives: row.lives, maxLives: row.max_lives, lastRegenAt: row.last_regen_at }, new Date());
      return eligibility('life', { ...NO_FACTS, refId, lives, maxLives });
    },
    async apply({ db, userId, purchase }) {
      if (!purchase.applied_at) {
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
      const mirror = await syncMirror(db, userId, REFILL_MIRROR_WAIT_MS);
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
};
