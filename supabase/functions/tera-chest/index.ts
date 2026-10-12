import { isSolanaAddress } from '../_shared/address.ts';
import { callerFailureStatus, resolveCaller } from '../_shared/caller.ts';
import { loadConfig, serviceClient } from '../_shared/db.ts';
import { corsHeaders, isUuid, json, langOf, pathAfter, readJsonObject } from '../_shared/http.ts';
import { callerAddress, takeRate, tooMany, type RateLimit } from '../_shared/ratelimit.ts';
import { CHEST_COLUMNS, chestContext, chestOfDay, chestView, chestsEnabled, recomputeView, settleChest, type ChestRow } from '../_shared/tera-chest-store.ts';
import { CHEST_BLOCK_WINDOW, CHEST_FORMULA, CHEST_SLOT_DISTANCE, ODDS_TABLE, VERIFIED_SHARE_MIN } from '../_shared/tera-roll.ts';

/** Reads are public and cheap; a settle may send two transactions, so one address gets fewer of those. */
const READ_RATE: RateLimit = { limit: 120, windowMs: 60_000 };
const SETTLE_RATE: RateLimit = { limit: 40, windowMs: 60_000 };
const LIST_LIMIT = 60;

/** The published rules: the odds by effort level and the constants of the commitment. */
const rules = () => ({
  formula: CHEST_FORMULA,
  odds_table: ODDS_TABLE,
  odds_total: 10_000,
  verified_share_min: VERIFIED_SHARE_MIN,
  slot_distance: CHEST_SLOT_DISTANCE,
  block_window: CHEST_BLOCK_WINDOW,
  levels: ['one point when the server graded at least 75% of the gradable answers of the day', 'one point when the server graded no answer of the day wrong', 'one point for the day that finishes the trail'],
});

Deno.serve(async (request) => {
  const [first, ...rest] = pathAfter(request, 'tera-chest');
  const isPublicRead = request.method === 'GET' && first !== undefined;
  const cors = corsHeaders(request, isPublicRead ? 'public' : 'app', 'GET, POST, OPTIONS');
  // A preflight cannot say which of the two it is for: the public read answers any origin, the rest only the app.
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: first !== undefined ? corsHeaders(request, 'public', 'GET, OPTIONS') : cors });
  if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const db = serviceClient();
    const lang = langOf(request, 'pt');

    if (isPublicRead) {
      const verdict = await takeRate(db, 'tera-chest', callerAddress(request), READ_RATE);
      if (!verdict.allowed) return tooMany(verdict, cors);
      if (first === 'rules' && rest.length === 0) return json(rules(), 200, { ...cors, 'Cache-Control': 'public, max-age=300' });
      // By chest id, or by the address of the Tera a chest minted (what an earned Tera's page has at hand).
      if (rest.length > 0 || !(isUuid(first) || isSolanaAddress(first))) return json({ error: 'not_found' }, 404, cors);
      let chestId = first;
      if (!isUuid(first)) {
        const { data, error } = await db.from('avatar_assets').select('chest_id').eq('asset_address', first).not('chest_id', 'is', null).maybeSingle();
        if (error) throw new Error(`avatar_assets: ${error.message}`);
        if (!data?.chest_id) return json({ error: 'not_found' }, 404, cors);
        chestId = data.chest_id as string;
      }
      const { data, error } = await db.from('tera_chests').select(CHEST_COLUMNS).eq('id', chestId).maybeSingle();
      if (error) throw new Error(`tera_chests: ${error.message}`);
      if (!data) return json({ error: 'not_found' }, 404, cors);
      const chest = data as ChestRow;
      const context = await chestContext(db, [chest]);
      return json({ chest: chestView(chest, context, lang), recompute: await recomputeView(db, chest, context) }, 200, { ...cors, 'Cache-Control': chest.status === 'minted' ? 'public, max-age=60' : 'no-store' });
    }

    const caller = await resolveCaller(db, request);
    if (typeof caller === 'string') return json({ error: caller }, callerFailureStatus(caller), cors);
    const config = await loadConfig(db);
    const enabled = chestsEnabled(config);

    if (request.method === 'GET') {
      const { data, error } = await db.from('tera_chests').select(CHEST_COLUMNS).eq('user_id', caller.iteraUserId).order('created_at', { ascending: false }).limit(LIST_LIMIT);
      if (error) throw new Error(`tera_chests: ${error.message}`);
      const chests = (data ?? []) as ChestRow[];
      const context = await chestContext(db, chests);
      return json({ enabled, chests: chests.map((chest) => chestView(chest, context, lang)), rules: rules() }, 200, { ...cors, 'Cache-Control': 'private, no-store' });
    }

    // POST: settle (or poll) the chest of one stamped day. The body names a lesson and nothing else is read from it:
    // the learner, the wallet, the day, the level, the tier and the Tera all come from the token, the tables and the chain.
    const verdict = await takeRate(db, 'tera-chest-settle', caller.iteraUserId, SETTLE_RATE);
    if (!verdict.allowed) return tooMany(verdict, cors);
    const body = await readJsonObject(request, 512);
    const lessonId = body && typeof body.lesson_id === 'string' && isUuid(body.lesson_id) ? body.lesson_id : null;
    if (!lessonId) return json({ error: 'invalid_body' }, 400, cors);
    const found = await chestOfDay(db, config, caller.iteraUserId, lessonId);
    if (!found) return json({ enabled, chest: null }, 200, cors);
    const outcome = await settleChest(db, config, found.id);
    const chest = outcome?.chest ?? found;
    const context = await chestContext(db, [chest]);
    return json({ enabled, chest: chestView(chest, context, lang, outcome?.retryAfterMs) }, 200, { ...cors, 'Cache-Control': 'private, no-store' });
  } catch (error) {
    console.error('tera-chest failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
