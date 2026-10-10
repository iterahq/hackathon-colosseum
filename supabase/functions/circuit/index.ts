import { isSolanaAddress } from '../_shared/address.ts';
import { circuitTotals } from '../_shared/circuit.ts';
import { retryCircuits, walletCircuit } from '../_shared/circuit-store.ts';
import { inBackground } from '../_shared/companion-store.ts';
import { explorerUrl } from '../_shared/credential.ts';
import { loadConfig, serviceClient } from '../_shared/db.ts';
import { corsHeaders, json } from '../_shared/http.ts';

const RECENT = 10;
const PAGE = 1000;

/** Public counter of the Circuito: what the shop moved from the treasury to the key that pays for stamps. */
Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'public');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const wallet = new URL(request.url).searchParams.get('wallet');
    if (wallet !== null && !isSolanaAddress(wallet)) return json({ error: 'invalid_address' }, 400, cors);

    const db = serviceClient();
    const sent: Array<{ circuit_lamports: number; circuit_signature: string; circuit_at: string }> = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from('purchases')
        .select('circuit_lamports,circuit_signature,circuit_at')
        .eq('circuit_status', 'sent')
        .order('circuit_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`purchases: ${error.message}`);
      sent.push(...((data ?? []) as typeof sent));
      if (!data || data.length < PAGE) break;
    }
    const [config, mine] = await Promise.all([loadConfig(db), wallet ? walletCircuit(db, wallet) : null]);
    // Off the response path: transfers that failed or never ran are taken up again (at most two per call).
    inBackground(retryCircuits(db));
    return json(
      {
        ...circuitTotals(sent),
        cluster: config.cluster ?? 'devnet',
        treasury: config.treasury ?? null,
        authority: config.authority ?? null,
        treasury_explorer_url: explorerUrl('address', config.treasury ?? null),
        authority_explorer_url: explorerUrl('address', config.authority ?? null),
        recent: sent.slice(0, RECENT).map((row) => ({ at: row.circuit_at, lamports: Number(row.circuit_lamports), tx_signature: row.circuit_signature, explorer_url: explorerUrl('tx', row.circuit_signature) })),
        ...(mine ? { wallet: mine } : {}),
      },
      200,
      // A wallet's own share is read right after its purchase: that answer is never cached.
      { ...cors, 'Cache-Control': wallet ? 'no-store' : 'public, max-age=15' },
    );
  } catch (error) {
    console.error('circuit failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
