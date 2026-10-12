import { callerFailureStatus, resolveCaller, type Caller } from '../_shared/caller.ts';
import { APP_URL } from '../_shared/credential.ts';
import { serviceClient, type IteraClient } from '../_shared/db.ts';
import { corsHeaders, json, readJsonObject } from '../_shared/http.ts';
import { companyStatus, deleteContact, loadContact, lookedAt, profileOf, setProfile } from '../_shared/privacy-store.ts';
import { takeRate, tooMany, type RateLimit } from '../_shared/ratelimit.ts';

const FUNCTION = 'privacy';
const READ_RATE: RateLimit = { limit: 60, windowMs: 60_000 };
const WRITE_RATE: RateLimit = { limit: 20, windowMs: 60_000 };

async function listed(db: IteraClient, userId: string): Promise<boolean> {
  const { count, error } = await db.from('talent_listings').select('user_id', { count: 'exact', head: true }).eq('user_id', userId);
  if (error) throw new Error(`talent_listings: ${error.message}`);
  return (count ?? 0) > 0;
}

/** The caller's own privacy: the switch, their contact while listed, how many companies looked. Never anybody else's. */
async function view(db: IteraClient, caller: Caller) {
  const [profile, isListed, contact, looked, company] = await Promise.all([
    profileOf(db, caller.iteraUserId),
    listed(db, caller.iteraUserId),
    loadContact(db, caller.iteraUserId),
    lookedAt(db, caller.iteraUserId),
    companyStatus(db, caller),
  ]);
  return {
    wallet: caller.wallet,
    public_profile: profile.public,
    public_profile_source: profile.source,
    profile_url: caller.wallet ? `${APP_URL}/u/${caller.wallet}` : null,
    talent: { listed: isListed, contact: isListed ? contact : null, ...looked },
    company,
  };
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app', 'GET, POST, OPTIONS');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
  const headers = { ...cors, 'Cache-Control': 'private, no-store' };
  try {
    const db = serviceClient();
    const caller = await resolveCaller(db, request);
    if (typeof caller === 'string') return json({ error: caller }, callerFailureStatus(caller), cors);
    const verdict = await takeRate(db, `${FUNCTION}:${request.method === 'GET' ? 'read' : 'write'}`, caller.iteraUserId, request.method === 'GET' ? READ_RATE : WRITE_RATE);
    if (!verdict.allowed) return tooMany(verdict, cors);
    if (request.method === 'GET') return json(await view(db, caller), 200, headers);

    const body = await readJsonObject(request, 512);
    if (!body || body.action !== 'set_profile' || typeof body.public !== 'boolean') return json({ error: 'invalid_body' }, 400, cors);
    if (body.public === false && (await listed(db, caller.iteraUserId))) {
      // A listing needs the public page. Switching the page off while listed is refused unless the same call leaves the board,
      // which deletes the contact first and the listing after.
      if (body.leave_board !== true) return json({ error: 'listed_on_talent_board' }, 409, cors);
      await deleteContact(db, caller.iteraUserId);
      const { error } = await db.from('talent_listings').delete().eq('user_id', caller.iteraUserId);
      if (error) throw new Error(`talent_listings delete: ${error.message}`);
    }
    await setProfile(db, caller.iteraUserId, body.public);
    return json(await view(db, caller), 200, headers);
  } catch (error) {
    console.error('privacy failed', error instanceof Error ? error.message : 'error');
    return json({ error: 'internal_error' }, 500, cors);
  }
});
