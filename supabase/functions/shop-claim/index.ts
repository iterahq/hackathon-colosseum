import { GLOBAL_REF } from '../_shared/awards.ts';
import { callerFailureStatus, resolveCaller } from '../_shared/caller.ts';
import { companionResponse, ensureCompanion, loadInventory, loadStats } from '../_shared/companion-store.ts';
import { pickText } from '../_shared/credential.ts';
import { serviceClient } from '../_shared/db.ts';
import { corsHeaders, json, readJsonObject } from '../_shared/http.ts';
import { ITEM_COLUMNS, type ShopItem } from '../_shared/shop-items.ts';
import { claimVerdict, unlockView } from '../_shared/unlock.ts';

const UNIQUE_VIOLATION = '23505';

/** Takes an item the learner earned (level unlock) without payment. Idempotent. */
Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const db = serviceClient();
    const caller = await resolveCaller(db, request);
    if (typeof caller === 'string') return json({ error: caller }, callerFailureStatus(caller), cors);
    const body = await readJsonObject(request);
    const itemKey = body?.item_key;
    if (!body || typeof itemKey !== 'string' || itemKey.length === 0 || itemKey.length > 64) return json({ error: 'invalid_body' }, 400, cors);
    const lang = body.lang === 'en' ? 'en' : 'pt';

    const { data: found, error: itemError } = await db.from('shop_items').select(ITEM_COLUMNS).eq('key', itemKey).maybeSingle();
    if (itemError) throw new Error(`shop_items: ${itemError.message}`);
    const item = found as ShopItem | null;
    if (!item) return json({ error: 'item_not_found' }, 404, cors);
    if (!item.active) return json({ error: 'item_inactive' }, 409, cors);

    const userId = caller.iteraUserId;
    const now = new Date();
    const [companion, stats] = await Promise.all([ensureCompanion(db, userId), loadStats(db, userId, now)]);
    const owned = (await loadInventory(db, userId, companion.outfit)).some((entry) => entry.item_key === item.key);
    const unlock = unlockView(item.effect, stats.level);
    const verdict = claimVerdict({ kind: item.kind, effect: item.effect, level: stats.level, owned });
    if (verdict === 'not_claimable') return json({ error: 'not_claimable' }, 409, cors);
    if (verdict === 'locked') return json({ error: 'locked', unlock }, 409, cors);

    if (verdict === 'claim') {
      // The record first: a failure after it leaves a claim the next call completes, never a grant without history.
      const at = now.toISOString();
      const { error: recordError } = await db.from('purchases').insert({
        user_id: userId,
        item_key: item.key,
        ref_id: GLOBAL_REF,
        lamports: 0,
        price_usd_cents: 0,
        status: 'paid',
        source: 'claim',
        wallet: caller.wallet ?? '',
        memo: `claim:${item.key}`,
        expires_at: at,
        paid_at: at,
        applied_at: at,
      });
      if (recordError && recordError.code !== UNIQUE_VIOLATION) throw new Error(`purchases claim: ${recordError.message}`);
      const { error: grantError } = await db
        .from('user_inventory')
        .upsert({ user_id: userId, item_key: item.key, ref_id: GLOBAL_REF, qty: 1, updated_at: at });
      if (grantError) throw new Error(`user_inventory grant: ${grantError.message}`);
    }

    return json(
      {
        status: 'claimed',
        already_owned: verdict === 'already_owned',
        item: { key: item.key, kind: item.kind, title: pickText(item.title_i18n, lang) },
        unlock,
        ...companionResponse(companion, stats, now),
        inventory: await loadInventory(db, userId, companion.outfit),
        wallet: caller.wallet,
      },
      200,
      cors,
    );
  } catch (error) {
    console.error('shop-claim failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
