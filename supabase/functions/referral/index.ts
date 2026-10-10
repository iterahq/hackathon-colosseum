import { callerFailureStatus, resolveCaller } from '../_shared/caller.ts';
import { APP_URL } from '../_shared/credential.ts';
import { serviceClient } from '../_shared/db.ts';
import { corsHeaders, json, readJsonObject } from '../_shared/http.ts';
import { claimReferral, ensureCode, loadEntries } from '../_shared/referral-store.ts';
import { referralStatus } from '../_shared/referral.ts';

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const db = serviceClient();
    const caller = await resolveCaller(db, request);
    if (typeof caller === 'string') return json({ error: caller }, callerFailureStatus(caller), cors);
    const body = await readJsonObject(request);
    if (!body || (body.action !== 'status' && body.action !== 'claim')) return json({ error: 'invalid_body' }, 400, cors);

    if (body.action === 'claim') return json(await claimReferral(db, caller.iteraUserId, body.code), 200, cors);

    const [code, entries] = await Promise.all([ensureCode(db, caller.iteraUserId), loadEntries(db, caller.iteraUserId)]);
    return json(referralStatus(code, APP_URL, entries), 200, cors);
  } catch (error) {
    console.error('referral failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
