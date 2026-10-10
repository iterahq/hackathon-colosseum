import { loadAvatarCatalog, loadAvatarRows, loadSupply, supabaseUrl } from '../_shared/avatar-store.ts';
import { includedWithMap, shopAvatarFields, type AvatarAssetRow, type AvatarCatalog, type AvatarSupply } from '../_shared/avatars.ts';
import { resolveCaller } from '../_shared/caller.ts';
import { ensureCompanion, loadInventory, loadStats, type InventoryEntry } from '../_shared/companion-store.ts';
import { pickText } from '../_shared/credential.ts';
import { borderOf, isThemeDefault } from '../_shared/crystals.ts';
import { serviceClient } from '../_shared/db.ts';
import { bearerToken, corsHeaders, json, langOf } from '../_shared/http.ts';
import { ITEM_COLUMNS, type ShopItem } from '../_shared/shop-items.ts';
import { isItemKind } from '../_shared/shop-rules.ts';
import { unlockLevelOf, unlockView } from '../_shared/unlock.ts';

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app', 'GET, OPTIONS');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const db = serviceClient();
    const lang = langOf(request, 'pt');
    const { data, error } = await db.from('shop_items').select(ITEM_COLUMNS).eq('active', true).order('sort').order('key');
    if (error) throw new Error(`shop_items: ${error.message}`);

    // A missing or foreign token (the anon key a client sends by default) just means "nobody signed in".
    let inventory: InventoryEntry[] = [];
    let level: number | null = null;
    let wornAvatar: string | null = null;
    let avatarRows: AvatarAssetRow[] = [];
    let wornBorder: string | null = null;
    const hasAvatars = ((data ?? []) as ShopItem[]).some((item) => item.kind === 'avatar');
    // Avatars: the catalog with its tiers, and how many units of each are gone. Never fatal for the other shelves.
    let avatars: { catalog: AvatarCatalog; supply: Map<string, AvatarSupply> } | null = null;
    if (hasAvatars) {
      try {
        // Read fresh: the shop is where a newly inserted avatar has to show up at once.
        const [catalog, supply] = await Promise.all([loadAvatarCatalog(db, true), loadSupply(db)]);
        avatars = { catalog, supply };
      } catch (failure) {
        console.error('shop-items: avatars unavailable', failure instanceof Error ? failure.message : failure);
      }
    }
    if (bearerToken(request)) {
      const caller = await resolveCaller(db, request);
      if (typeof caller !== 'string') {
        const companion = await ensureCompanion(db, caller.iteraUserId);
        inventory = await loadInventory(db, caller.iteraUserId, companion.outfit);
        wornAvatar = companion.avatar;
        const { data: theme, error: themeError } = await db.from('learner_themes').select('border_key').eq('user_id', caller.iteraUserId).maybeSingle();
        if (themeError) throw new Error(`learner_themes: ${themeError.message}`);
        wornBorder = (theme?.border_key as string | null | undefined) ?? null;
        if (avatars) avatarRows = await loadAvatarRows(db, caller.iteraUserId);
        // The level is only read when some item on sale can also be earned.
        if (((data ?? []) as ShopItem[]).some((item) => unlockLevelOf(item.effect) !== null)) {
          level = (await loadStats(db, caller.iteraUserId, new Date())).level;
        }
      }
    }

    // A gift is bought on someone's profile, not in the shop list: it is listed only when asked for (`?with=gift`).
    const includedWith = avatars ? includedWithMap(avatars.catalog) : new Map<string, string>();
    const withGift = new URL(request.url).searchParams.get('with') === 'gift';
    const items = ((data ?? []) as ShopItem[])
      .filter((item) => isItemKind(item.kind) && (item.kind !== 'gift' || withGift) && (item.kind !== 'avatar' || avatars?.catalog.items.has(item.key)))
      .map((item) => {
        if (item.kind === 'avatar' && avatars) {
          const avatar = avatars.catalog.items.get(item.key);
          if (avatar) {
            const own = avatarRows.find((row) => row.item_key === item.key) ?? null;
            return { ...shopAvatarFields(avatars.catalog, avatar, lang, supabaseUrl(), { supply: avatars.supply.get(item.key), own, equippedKey: wornAvatar }), art: item.art, owned_refs: [] };
          }
        }
        const held = inventory.filter((entry) => entry.item_key === item.key);
        if (item.kind === 'border') {
          const isDefault = isThemeDefault(item);
          return {
            key: item.key,
            kind: item.kind,
            title: pickText(item.title_i18n, lang),
            description: pickText(item.description_i18n, lang),
            price_usd_cents: item.price_usd_cents,
            price_lamports: item.price_lamports,
            price_label: item.price_label,
            price_crystals: item.price_crystals ?? null,
            for_sale: !isDefault && item.price_lamports !== null,
            included_with: includedWith.get(item.key) ?? null,
            border: borderOf(item),
            art: item.art,
            owned: isDefault || held.length > 0,
            equipped: isDefault ? wornBorder === null || wornBorder === item.key : wornBorder === item.key && held.length > 0,
            owned_refs: held.map((entry) => entry.ref_id),
          };
        }
        const unlock = unlockView(item.effect, level);
        return {
          ...(unlock ? { unlock } : {}),
          // A life pack says what it does: `{ add_lives: N }` or `{ unlimited_days: N }` (the plain refill: `{}`).
          ...(item.kind === 'life' ? { effect: item.effect } : {}),
          key: item.key,
          kind: item.kind,
          title: pickText(item.title_i18n, lang),
          description: pickText(item.description_i18n, lang),
          price_usd_cents: item.price_usd_cents,
          price_lamports: item.price_lamports,
          price_label: item.price_label,
          price_crystals: item.price_crystals ?? null,
          art: item.art,
          owned: held.length > 0,
          equipped: held.some((entry) => entry.equipped),
          owned_refs: held.map((entry) => entry.ref_id),
        };
      });
    return json(items, 200, { ...cors, 'Cache-Control': 'private, no-store' });
  } catch (error) {
    console.error('shop-items failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
