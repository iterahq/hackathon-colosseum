import { resolveCaller } from '../_shared/caller.ts';
import { ensureCompanion, loadInventory, loadStats, type InventoryEntry } from '../_shared/companion-store.ts';
import { pickText } from '../_shared/credential.ts';
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
    if (bearerToken(request)) {
      const caller = await resolveCaller(db, request);
      if (typeof caller !== 'string') {
        const companion = await ensureCompanion(db, caller.iteraUserId);
        inventory = await loadInventory(db, caller.iteraUserId, companion.outfit);
        // The level is only read when some item on sale can also be earned.
        if (((data ?? []) as ShopItem[]).some((item) => unlockLevelOf(item.effect) !== null)) {
          level = (await loadStats(db, caller.iteraUserId, new Date())).level;
        }
      }
    }

    // A gift is bought on someone's profile, not in the shop list: it is listed only when asked for (`?with=gift`).
    const withGift = new URL(request.url).searchParams.get('with') === 'gift';
    const items = ((data ?? []) as ShopItem[])
      .filter((item) => isItemKind(item.kind) && (item.kind !== 'gift' || withGift))
      .map((item) => {
        const held = inventory.filter((entry) => entry.item_key === item.key);
        const unlock = unlockView(item.effect, level);
        return {
          ...(unlock ? { unlock } : {}),
          key: item.key,
          kind: item.kind,
          title: pickText(item.title_i18n, lang),
          description: pickText(item.description_i18n, lang),
          price_usd_cents: item.price_usd_cents,
          price_lamports: item.price_lamports,
          price_label: item.price_label,
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
