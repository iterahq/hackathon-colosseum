import { GLOBAL_REF } from './awards.ts';
import { changeLives, ensureCompanion, syncMirror } from './companion-store.ts';
import { cosmeticsFromPurchases, cosmeticsOf, sameCosmetics, type CosmeticPurchase } from './cosmetics.ts';
import { onchainAttributes, type AchievementRow, type CatalogEntry } from './credential.ts';
import { CATALOG_COLUMNS, ROW_COLUMNS, loadConfig, type IteraClient } from './db.ts';
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
}

export interface ItemHandler {
  canBuy(context: ShopContext): Promise<Eligibility>;
  /** Idempotent: applying a paid purchase again leaves the same state. Throws when the effect is still due. */
  apply(context: ApplyContext): Promise<ApplyOutcome>;
}

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

/** Every paid cosmetic of the learner for this trail, as the pure rule reads them. */
async function paidCosmetics({ db, userId, refId }: ShopContext): Promise<CosmeticPurchase[]> {
  const { data, error } = await db
    .from('purchases')
    .select('paid_at,shop_items(kind,effect)')
    .eq('user_id', userId)
    .eq('ref_id', refId)
    .eq('status', 'paid');
  if (error) throw new Error(`purchases: ${error.message}`);
  const rows = (data ?? []) as unknown as Array<{ paid_at: string | null; shop_items: { kind: string; effect: Record<string, unknown> } | null }>;
  return rows.map((row) => ({ kind: row.shop_items?.kind ?? '', value: row.shop_items?.effect?.value, paid_at: row.paid_at ?? '' }));
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
    const [passport, purchases] = await Promise.all([loadPassport(context), paidCosmetics(context)]);
    if (!passport || passport.mint_status !== 'minted' || !passport.asset_address) throw new Error('passport is not minted');
    const wanted = cosmeticsFromPurchases(purchases);
    if (purchase.applied_at && sameCosmetics(cosmeticsOf(passport.state), wanted)) return { companion: false, passport };

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
    await sdk.updateCredentialAttributes(sdk.loadChain(), {
      asset: passport.asset_address,
      collection: config.collection_passports,
      attributes: onchainAttributes(updated, catalog as CatalogEntry),
    });
    await grant(context);
    return { companion: false, passport: updated };
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
      await syncMirror(db, userId);
      return { companion: true, passport: null };
    },
  },
  outfit: {
    async canBuy(context) {
      if (context.refId !== GLOBAL_REF) return eligibility('outfit', { ...NO_FACTS, refId: context.refId });
      return eligibility('outfit', { ...NO_FACTS, refId: context.refId, owned: await owns(context) });
    },
    async apply(context) {
      await grant(context);
      return { companion: true, passport: null };
    },
  },
  ink: passportCosmetic('ink'),
  frame: passportCosmetic('frame'),
};
