import { callerFailureStatus, resolveCaller } from '../_shared/caller.ts';
import { CLUSTER, explorerUrl } from '../_shared/credential.ts';
import { loadConfig, serviceClient, type IteraClient } from '../_shared/db.ts';
import { DROP_LAMPORTS, MAX_CLAIMS, claimStep, faucetMemo, unconfirmedStep, withinDailyBudget, type ClaimRow } from '../_shared/faucet.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { RENT_EXEMPT_MIN_LAMPORTS, fundsCheck } from '../_shared/purchase-verify.ts';
import { RpcError, balanceOf, rpcUrl } from '../_shared/rpc.ts';
import { TransferBroadcastError, TreasuryNotConfiguredError, sendFromTreasury, signatureFate } from '../_shared/treasury.ts';

const UNIQUE_VIOLATION = '23505';
const DAY_MS = 24 * 60 * 60 * 1000;
const CLAIM_COLUMNS = 'wallet,user_id,tx_signature,created_at,confirmed_at';

/** What the faucet gave (or locked to give) in the last 24 hours, and how many claims exist in all. */
async function faucetLoad(db: IteraClient, now: Date): Promise<{ givenToday: bigint; total: number }> {
  const [recent, total] = await Promise.all([
    db.from('devnet_airdrops').select('lamports').gte('created_at', new Date(now.getTime() - DAY_MS).toISOString()).limit(1000),
    db.from('devnet_airdrops').select('wallet', { count: 'exact', head: true }),
  ]);
  if (recent.error || total.error) throw new Error('faucet lookups failed');
  return { givenToday: (recent.data ?? []).reduce((sum, row) => sum + BigInt(row.lamports), 0n), total: total.count ?? 0 };
}

/**
 * Sends the drop for a claim row this call holds. The signature is stored the
 * moment the node accepts the transaction and the row is KEPT whatever happens
 * after that: a transfer that timed out is never paid a second time blindly.
 * The row is only released when nothing was handed to the node.
 */
async function send(db: IteraClient, wallet: string): Promise<{ signature: string } | { error: 'faucet_unavailable' | 'rpc_unavailable'; signature?: string }> {
  try {
    const signature = await sendFromTreasury({
      recipient: wallet,
      lamports: DROP_LAMPORTS,
      memo: faucetMemo(wallet),
      onBroadcast: async (sent) => {
        await db.from('devnet_airdrops').update({ tx_signature: sent }).eq('wallet', wallet);
      },
    });
    await db.from('devnet_airdrops').update({ tx_signature: signature, confirmed_at: new Date().toISOString() }).eq('wallet', wallet);
    return { signature };
  } catch (error) {
    console.error('faucet transfer failed', error instanceof Error ? error.message : error);
    if (error instanceof TransferBroadcastError) return { error: 'rpc_unavailable', signature: error.signature };
    await db.from('devnet_airdrops').delete().eq('wallet', wallet).is('tx_signature', null).is('confirmed_at', null);
    return { error: error instanceof TreasuryNotConfiguredError ? 'faucet_unavailable' : 'rpc_unavailable' };
  }
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const db = serviceClient();
    const caller = await resolveCaller(db, request);
    if (typeof caller === 'string') return json({ error: caller }, callerFailureStatus(caller), cors);
    const blocked = (reason: string) => json({ blocked: reason }, 200, cors);
    if (!caller.wallet) return blocked('no_wallet');
    if (CLUSTER !== 'devnet' || !rpcUrl().includes('devnet')) return blocked('not_devnet');

    const wallet = caller.wallet;
    const userId = caller.iteraUserId;
    const now = new Date();
    const paid = (signature: string) => json({ signature, lamports: Number(DROP_LAMPORTS), explorer_url: explorerUrl('tx', signature) }, 200, cors);
    const failed = (outcome: { error: string; signature?: string }) => json(outcome, 503, cors);

    // One claim per learner AND per wallet: any row that names either one counts.
    const claims = await db.from('devnet_airdrops').select(CLAIM_COLUMNS).or(`wallet.eq.${wallet},user_id.eq.${userId}`);
    if (claims.error) throw new Error(`devnet_airdrops: ${claims.error.message}`);
    const rows = (claims.data ?? []) as ClaimRow[];
    const step = claimStep(rows, { wallet, userId }, now);
    if (step === 'already_claimed') return blocked('already_claimed');

    if (step === 'check_chain') {
      // This wallet's claim was never seen confirmed. Ask the chain before anything is sent again.
      const own = rows[0];
      let next: ReturnType<typeof unconfirmedStep>;
      try {
        next = unconfirmedStep(own.tx_signature ? await signatureFate(own.tx_signature) : null);
      } catch (error) {
        if (!(error instanceof RpcError)) throw error;
        return json({ error: 'rpc_unavailable' }, 503, cors);
      }
      if (next === 'confirm') {
        await db.from('devnet_airdrops').update({ confirmed_at: now.toISOString() }).eq('wallet', wallet);
        return blocked('already_claimed');
      }
      if (next === 'wait') return blocked('already_claimed');
      // Nothing landed and nothing can: this call takes the same row over (compare-and-set on its time) and sends once.
      const { data: taken, error: takeError } = await db
        .from('devnet_airdrops')
        .update({ created_at: now.toISOString(), tx_signature: null })
        .eq('wallet', wallet)
        .eq('created_at', own.created_at)
        .is('confirmed_at', null)
        .select('wallet');
      if (takeError) throw new Error(`devnet_airdrops retake: ${takeError.message}`);
      if ((taken ?? []).length === 0) return blocked('already_claimed');
      const outcome = await send(db, wallet);
      return 'error' in outcome ? failed(outcome) : paid(outcome.signature);
    }

    const [load, cheapest, config] = await Promise.all([
      faucetLoad(db, now),
      db.from('shop_items').select('price_lamports').eq('active', true).order('price_lamports').limit(1).maybeSingle(),
      loadConfig(db),
    ]);
    if (cheapest.error) throw new Error('faucet lookups failed');
    if (!cheapest.data || !config.treasury || load.total >= MAX_CLAIMS) return json({ error: 'faucet_unavailable' }, 503, cors);
    // The global budget: what the treasury gives away in any 24 hours.
    if (!withinDailyBudget(load.givenToday)) return json({ error: 'faucet_unavailable' }, 503, cors);

    try {
      const [balance, treasuryBalance] = await Promise.all([balanceOf(wallet), balanceOf(config.treasury)]);
      if (fundsCheck(balance, BigInt(cheapest.data.price_lamports)).ok) return blocked('not_needed');
      if (treasuryBalance < DROP_LAMPORTS + RENT_EXEMPT_MIN_LAMPORTS * 2n) return json({ error: 'faucet_unavailable' }, 503, cors);
    } catch (error) {
      if (!(error instanceof RpcError)) throw error;
      return json({ error: 'rpc_unavailable' }, 503, cors);
    }

    // The row is the lock, unique per wallet and per learner. It is released only when nothing was sent.
    const { error: lockError } = await db.from('devnet_airdrops').insert({ wallet, user_id: userId, lamports: Number(DROP_LAMPORTS) });
    if (lockError?.code === UNIQUE_VIOLATION) return blocked('already_claimed');
    if (lockError) throw new Error(`devnet_airdrops: ${lockError.message}`);

    const outcome = await send(db, wallet);
    return 'error' in outcome ? failed(outcome) : paid(outcome.signature);
  } catch (error) {
    console.error('wallet-faucet failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
