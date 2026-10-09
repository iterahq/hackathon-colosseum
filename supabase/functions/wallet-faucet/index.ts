import { callerFailureStatus, resolveCaller } from '../_shared/caller.ts';
import { CLUSTER, explorerUrl } from '../_shared/credential.ts';
import { loadConfig, serviceClient } from '../_shared/db.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { RENT_EXEMPT_MIN_LAMPORTS, fundsCheck } from '../_shared/purchase-verify.ts';
import { RpcError, balanceOf, rpcUrl } from '../_shared/rpc.ts';
import { TreasuryNotConfiguredError, sendFromTreasury } from '../_shared/treasury.ts';

const DROP_LAMPORTS = 10_000_000n;
const MAX_CLAIMS = 200;
const UNIQUE_VIOLATION = '23505';

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
    const [claimed, total, cheapest, config] = await Promise.all([
      db.from('devnet_airdrops').select('wallet').eq('wallet', wallet).maybeSingle(),
      db.from('devnet_airdrops').select('wallet', { count: 'exact', head: true }),
      db.from('shop_items').select('price_lamports').eq('active', true).order('price_lamports').limit(1).maybeSingle(),
      loadConfig(db),
    ]);
    if (claimed.error || total.error || cheapest.error) throw new Error('faucet lookups failed');
    if (claimed.data) return blocked('already_claimed');
    if (!cheapest.data || !config.treasury || (total.count ?? 0) >= MAX_CLAIMS) return json({ error: 'faucet_unavailable' }, 503, cors);

    try {
      const [balance, treasuryBalance] = await Promise.all([balanceOf(wallet), balanceOf(config.treasury)]);
      if (fundsCheck(balance, BigInt(cheapest.data.price_lamports)).ok) return blocked('not_needed');
      if (treasuryBalance < DROP_LAMPORTS + RENT_EXEMPT_MIN_LAMPORTS * 2n) return json({ error: 'faucet_unavailable' }, 503, cors);
    } catch (error) {
      if (!(error instanceof RpcError)) throw error;
      return json({ error: 'rpc_unavailable' }, 503, cors);
    }

    // The row is the once-per-wallet lock; it is released when nothing was sent.
    const { error: lockError } = await db
      .from('devnet_airdrops')
      .insert({ wallet, user_id: caller.iteraUserId, lamports: Number(DROP_LAMPORTS) });
    if (lockError?.code === UNIQUE_VIOLATION) return blocked('already_claimed');
    if (lockError) throw new Error(`devnet_airdrops: ${lockError.message}`);

    let signature: string;
    try {
      signature = await sendFromTreasury({ recipient: wallet, lamports: DROP_LAMPORTS, memo: `faucet:${caller.iteraUserId}` });
    } catch (error) {
      console.error('faucet transfer failed', error instanceof Error ? error.message : error);
      await db.from('devnet_airdrops').delete().eq('wallet', wallet).is('tx_signature', null);
      const code = error instanceof TreasuryNotConfiguredError ? 'faucet_unavailable' : 'rpc_unavailable';
      return json({ error: code }, 503, cors);
    }
    await db.from('devnet_airdrops').update({ tx_signature: signature }).eq('wallet', wallet);
    return json({ signature, lamports: Number(DROP_LAMPORTS), explorer_url: explorerUrl('tx', signature) }, 200, cors);
  } catch (error) {
    console.error('wallet-faucet failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
