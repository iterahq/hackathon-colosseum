import { callerFailureStatus, resolveCaller } from '../_shared/caller.ts';
import { serviceClient } from '../_shared/db.ts';
import { corsHeaders, isUuid, json, readJsonObject } from '../_shared/http.ts';
import { settlePurchase } from '../_shared/purchase-settle.ts';
import { isSignature } from '../_shared/solana-tx.ts';

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const db = serviceClient();
    const caller = await resolveCaller(db, request);
    if (typeof caller === 'string') return json({ error: caller }, callerFailureStatus(caller), cors);

    const body = await readJsonObject(request);
    const intentId = body?.intent_id;
    const signature = body?.signature;
    if (!body || typeof intentId !== 'string' || !isUuid(intentId) || !isSignature(signature)) {
      return json({ error: 'invalid_body' }, 400, cors);
    }

    const settlement = await settlePurchase(db, caller, { intentId, signature, lang: body.lang === 'en' ? 'en' : 'pt' });
    return json(settlement.body, settlement.status, cors);
  } catch (error) {
    console.error('purchase-confirm failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
