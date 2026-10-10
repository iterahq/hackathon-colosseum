import { callerFailureStatus, resolveCaller } from '../_shared/caller.ts';
import { serviceClient } from '../_shared/db.ts';
import { reconcileGiftsWithin } from '../_shared/gift-reconcile.ts';
import { GIFT_COLUMNS, giftView, type GiftRow } from '../_shared/gift-store.ts';
import { corsHeaders, isUuid, json, readJsonObject } from '../_shared/http.ts';

const INBOX_LIMIT = 5;
const MAX_IDS = 20;
const RECONCILE_BUDGET_MS = 4_000;

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const db = serviceClient();
    const caller = await resolveCaller(db, request);
    if (typeof caller === 'string') return json({ error: caller }, callerFailureStatus(caller), cors);
    const body = await readJsonObject(request);
    if (!body || (body.action !== 'inbox' && body.action !== 'seen')) return json({ error: 'invalid_body' }, 400, cors);
    const userId = caller.iteraUserId;

    if (body.action === 'seen') {
      const ids = body.ids;
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS || !ids.every((id) => typeof id === 'string' && isUuid(id))) {
        return json({ error: 'invalid_body' }, 400, cors);
      }
      const { data, error } = await db
        .from('gifts')
        .update({ seen_at: new Date().toISOString() })
        .eq('to_user_id', userId)
        .is('seen_at', null)
        .in('id', ids as string[])
        .select('id');
      if (error) throw new Error(`gifts seen: ${error.message}`);
      return json({ seen: (data ?? []).length }, 200, cors);
    }

    // The app asks this on load: a gift whose confirm never arrived lands before it is listed.
    await reconcileGiftsWithin(db, { toUserId: userId }, RECONCILE_BUDGET_MS);
    const { data, error } = await db
      .from('gifts')
      .select(GIFT_COLUMNS)
      .eq('to_user_id', userId)
      .eq('status', 'delivered')
      .is('seen_at', null)
      .order('delivered_at')
      .limit(INBOX_LIMIT);
    if (error) throw new Error(`gifts inbox: ${error.message}`);
    const gifts = await Promise.all(((data ?? []) as GiftRow[]).map((gift) => giftView(db, gift)));
    return json({ gifts }, 200, cors);
  } catch (error) {
    console.error('gifts failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
