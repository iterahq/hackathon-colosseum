import { loadAvatarCatalog, loadAvatarRows, loadSupply, supabaseUrl } from '../_shared/avatar-store.ts';
import { includedWithMap, shopAvatarFields, type AvatarAssetRow, type AvatarCatalog, type AvatarSupply } from '../_shared/avatars.ts';
import { resolveCaller } from '../_shared/caller.ts';
import { ensureCompanion, loadInventory, loadStats, type InventoryEntry } from '../_shared/companion-store.ts';
import { pickText } from '../_shared/credential.ts';
import { THEME_KINDS, borderOf, isThemeDefault, themeColor } from '../_shared/crystals.ts';
import { loadConfig, serviceClient } from '../_shared/db.ts';
import { SHOP_ACCEPT_KEY, parseAccept, resolvedCurrencies } from '../_shared/shop-accept.ts';
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
    // Everything that does not depend on another read starts together: the items, the avatar catalog and
    // supply (read fresh: the shop is where a newly inserted avatar has to show up at once), the caller, the config.
    // A missing or foreign token (the anon key a client sends by default) just means "nobody signed in".
    const [itemsResult, avatarsResult, caller, config] = await Promise.all([
      db.from('shop_items').select(ITEM_COLUMNS).eq('active', true).order('sort').order('key'),
      Promise.all([loadAvatarCatalog(db, true), loadSupply(db)]).then(
        ([catalog, supply]) => ({ catalog, supply }),
        // Never fatal for the other shelves.
        (failure) => {
          console.error('shop-items: avatars unavailable', failure instanceof Error ? failure.message : failure);
          return null;
        },
      ),
      bearerToken(request) ? resolveCaller(db, request) : Promise.resolve(null),
      loadConfig(db),
    ]);
    const { data, error } = itemsResult;
    if (error) throw new Error(`shop_items: ${error.message}`);
    const shelf = (data ?? []) as ShopItem[];

    let inventory: InventoryEntry[] = [];
    let level: number | null = null;
    let wornAvatar: string | null = null;
    let avatarRows: AvatarAssetRow[] = [];
    let chosenTheme: Record<string, string | null | undefined> = {};
    const avatars: { catalog: AvatarCatalog; supply: Map<string, AvatarSupply> } | null = shelf.some((item) => item.kind === 'avatar') ? avatarsResult : null;
    if (caller !== null && typeof caller !== 'string') {
      const userId = caller.iteraUserId;
      const companion = await ensureCompanion(db, userId);
      wornAvatar = companion.avatar;
      // The level is only read when some item on sale can also be earned.
      const needsLevel = shelf.some((item) => unlockLevelOf(item.effect) !== null);
      const [loadedInventory, theme, rows, stats] = await Promise.all([
        loadInventory(db, userId, companion.outfit),
        db.from('learner_themes').select('background_key,icon_key,border_key').eq('user_id', userId).maybeSingle(),
        avatars ? loadAvatarRows(db, userId) : Promise.resolve([] as AvatarAssetRow[]),
        needsLevel ? loadStats(db, userId, new Date()) : Promise.resolve(null),
      ]);
      if (theme.error) throw new Error(`learner_themes: ${theme.error.message}`);
      inventory = loadedInventory;
      chosenTheme = { background: theme.data?.background_key, app_icon: theme.data?.icon_key, border: theme.data?.border_key };
      avatarRows = rows;
      level = stats ? stats.level : null;
    }

    // A gift is bought on someone's profile, not in the shop list: it is listed only when asked for (`?with=gift`).
    const accept = parseAccept(config[SHOP_ACCEPT_KEY]);
    const includedWith = avatars ? includedWithMap(avatars.catalog) : new Map<string, string>();
    const withGift = new URL(request.url).searchParams.get('with') === 'gift';
    const items = ((data ?? []) as ShopItem[])
      .filter((item) => isItemKind(item.kind) && (item.kind !== 'gift' || withGift) && (item.kind !== 'avatar' || avatars?.catalog.items.has(item.key)))
      .map((item) => {
        if (item.kind === 'avatar' && avatars) {
          const avatar = avatars.catalog.items.get(item.key);
          if (avatar) {
            const own = avatarRows.find((row) => row.item_key === item.key) ?? null;
            return { ...shopAvatarFields(avatars.catalog, avatar, lang, supabaseUrl(), { supply: avatars.supply.get(item.key), own, equippedKey: wornAvatar }), ...resolvedCurrencies(accept, item), art: item.art, owned_refs: [] };
          }
        }
        const held = inventory.filter((entry) => entry.item_key === item.key);
        if (THEME_KINDS.includes(item.kind)) {
          const isDefault = isThemeDefault(item);
          const owned = isDefault || held.length > 0;
          const chosen = chosenTheme[item.kind];
          const chosenOwned = chosen ? inventory.some((entry) => entry.item_key === chosen) : false;
          return {
            key: item.key,
            kind: item.kind,
            title: pickText(item.title_i18n, lang),
            description: pickText(item.description_i18n, lang),
            price_usd_cents: item.price_usd_cents,
            price_lamports: item.price_lamports,
            price_label: item.price_label,
            price_crystals: item.price_crystals ?? null,
            ...resolvedCurrencies(accept, item),
            for_sale: !isDefault && item.price_lamports !== null,
            included_with: includedWith.get(item.key) ?? null,
            ...(item.kind === 'border' ? { border: borderOf(item) } : { color: themeColor(item) }),
            art: item.art,
            owned,
            // The default is worn while nothing else owned is chosen.
            equipped: isDefault ? !chosen || !chosenOwned || chosen === item.key : chosen === item.key && held.length > 0,
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
          ...resolvedCurrencies(accept, item),
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
