import { isSolanaAddress } from '../_shared/address.ts';
import { callerFailureStatus, linkedWalletOf, resolveCaller, type Caller } from '../_shared/caller.ts';
import { serviceClient, type IteraClient } from '../_shared/db.ts';
import { verifyWalletSignature } from '../_shared/ed25519.ts';
import { corsHeaders, isUuid, json, readJsonObject } from '../_shared/http.ts';
import { CHALLENGE_TTL_MS, buildLinkMessage, challengeVerdict, newNonce } from '../_shared/wallet-link.ts';

const UNIQUE_VIOLATION = '23505';
const CHALLENGE_COLUMNS = 'id,wallet,message,expires_at,used_at';

interface Answer {
  status: number;
  body: Record<string, unknown>;
}

const refuse = (error: string, status: number): Answer => ({ status, body: { error } });

/** True when the wallet signs in as an account of its own or is linked to another learner. */
async function walletTaken(db: IteraClient, wallet: string, userId: string): Promise<boolean> {
  const [identity, linked] = await Promise.all([
    db.rpc('wallet_identity_user', { p_address: wallet }),
    db.from('user_wallets').select('user_id').eq('wallet', wallet).maybeSingle(),
  ]);
  if (identity.error) throw new Error(`wallet_identity_user: ${identity.error.message}`);
  if (linked.error) throw new Error(`user_wallets: ${linked.error.message}`);
  return identity.data !== null || (linked.data !== null && linked.data.user_id !== userId);
}

async function createChallenge(db: IteraClient, caller: Caller, address: unknown): Promise<Answer> {
  if (await linkedWalletOf(db, caller.iteraUserId)) return refuse('already_linked', 409);
  if (!isSolanaAddress(address)) return refuse('invalid_address', 400);
  if (await walletTaken(db, address, caller.iteraUserId)) return refuse('wallet_in_use', 409);

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
  const nonce = newNonce();
  const message = buildLinkMessage({ address, userId: caller.iteraUserId, nonce, issuedAt, expiresAt });

  // One open challenge per learner: asking again retires the previous one.
  const { error: retireError } = await db.from('wallet_link_challenges').delete().eq('user_id', caller.iteraUserId);
  if (retireError) throw new Error(`wallet_link_challenges retire: ${retireError.message}`);
  const { data, error } = await db
    .from('wallet_link_challenges')
    .insert({ user_id: caller.iteraUserId, wallet: address, nonce, message, expires_at: expiresAt.toISOString() })
    .select('id')
    .single();
  if (error) throw new Error(`wallet_link_challenges: ${error.message}`);
  return { status: 200, body: { challenge_id: data.id, message, expires_at: expiresAt.toISOString() } };
}

async function verifyChallenge(db: IteraClient, caller: Caller, challengeId: unknown, signature: unknown): Promise<Answer> {
  if (typeof challengeId !== 'string' || !isUuid(challengeId) || typeof signature !== 'string') return refuse('invalid_body', 400);

  const { data: challenge, error } = await db
    .from('wallet_link_challenges')
    .select(CHALLENGE_COLUMNS)
    .eq('id', challengeId)
    .eq('user_id', caller.iteraUserId)
    .maybeSingle();
  if (error) throw new Error(`wallet_link_challenges: ${error.message}`);
  const verdict = challengeVerdict(challenge, new Date());
  if (verdict !== 'ok' || !challenge) return refuse(verdict, verdict === 'challenge_not_found' ? 404 : 410);

  if (!(await verifyWalletSignature(challenge.wallet, signature, new TextEncoder().encode(challenge.message)))) {
    return refuse('signature_invalid', 422);
  }

  // Single use, decided by the database: of two concurrent verifications one finds no row.
  const now = new Date().toISOString();
  const { data: consumed, error: consumeError } = await db
    .from('wallet_link_challenges')
    .update({ used_at: now })
    .eq('id', challenge.id)
    .is('used_at', null)
    .gt('expires_at', now)
    .select('id');
  if (consumeError) throw new Error(`wallet_link_challenges consume: ${consumeError.message}`);
  if ((consumed ?? []).length === 0) return refuse('challenge_expired', 410);

  if (await linkedWalletOf(db, caller.iteraUserId)) return refuse('already_linked', 409);
  if (await walletTaken(db, challenge.wallet, caller.iteraUserId)) return refuse('wallet_in_use', 409);

  const { data: linked, error: linkError } = await db
    .from('user_wallets')
    .insert({ user_id: caller.iteraUserId, wallet: challenge.wallet })
    .select('wallet,linked_at')
    .single();
  if (linkError?.code === UNIQUE_VIOLATION) {
    return refuse((await linkedWalletOf(db, caller.iteraUserId)) ? 'already_linked' : 'wallet_in_use', 409);
  }
  if (linkError) throw new Error(`user_wallets: ${linkError.message}`);

  const { count, error: countError } = await db
    .from('user_achievements')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', caller.iteraUserId)
    .eq('mint_status', 'unclaimed');
  if (countError) throw new Error(`user_achievements: ${countError.message}`);
  return { status: 200, body: { wallet: linked.wallet, linked_at: linked.linked_at, pending_mints: count ?? 0 } };
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const db = serviceClient();
    const caller = await resolveCaller(db, request);
    if (typeof caller === 'string') return json({ error: caller }, callerFailureStatus(caller), cors);

    const body = await readJsonObject(request);
    const action = body?.action;
    if (!body || (action !== 'challenge' && action !== 'verify' && action !== 'status')) {
      return json({ error: 'invalid_body' }, 400, cors);
    }
    if (action === 'status') return json({ wallet: caller.wallet, source: caller.walletSource }, 200, cors);
    if (caller.walletSource === 'identity') return json({ error: 'already_wallet_account' }, 409, cors);

    const answer =
      action === 'challenge'
        ? await createChallenge(db, caller, body.address)
        : await verifyChallenge(db, caller, body.challenge_id, body.signature);
    return json(answer.body, answer.status, cors);
  } catch (error) {
    console.error('link-wallet failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
