import { isSolanaAddress } from '../_shared/address.ts';
import { CIRCUIT_SHARE_PERCENT, STAMP_FEE_LAMPORTS, circuitTotals } from '../_shared/circuit.ts';
import { retryCircuits, walletCircuit } from '../_shared/circuit-store.ts';
import { inBackground } from '../_shared/companion-store.ts';
import { explorerUrl } from '../_shared/credential.ts';
import { loadConfig, serviceClient } from '../_shared/db.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { loadTestAccountIds } from '../_shared/test-accounts.ts';

const RECENT = 10;
const PAGE = 1000;

interface SentRow {
  user_id: string;
  lamports: number | string;
  circuit_lamports: number;
  circuit_signature: string;
  circuit_at: string;
}

/** The cheapest and dearest item on the shelf right now, so the landing quotes the shop's own prices. */
async function shopPriceRange(db: ReturnType<typeof serviceClient>): Promise<{ min_usd_cents: number; max_usd_cents: number; items: number } | null> {
  const { data, error } = await db.from('shop_items').select('price_usd_cents').eq('active', true).neq('kind', 'gift').gt('price_usd_cents', 0);
  if (error) throw new Error(`shop_items: ${error.message}`);
  const cents = (data ?? []).map((row) => Number(row.price_usd_cents)).filter((n) => Number.isFinite(n) && n > 0);
  if (cents.length === 0) return null;
  return { min_usd_cents: Math.min(...cents), max_usd_cents: Math.max(...cents), items: cents.length };
}

/**
 * Public counter of the Circuito: what the shop moved from the treasury to the key that pays for stamps.
 * The headline counts EVERY confirmed transfer, the team's own test runs included, so it never shrinks
 * when an account is tagged as a test later. `outside` is the same sum without the tagged accounts,
 * labelled as such. `as_of` is when this answer was computed.
 */
Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'public');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const wallet = new URL(request.url).searchParams.get('wallet');
    if (wallet !== null && !isSolanaAddress(wallet)) return json({ error: 'invalid_address' }, 400, cors);

    const db = serviceClient();
    const all: SentRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from('purchases')
        .select('user_id,lamports,circuit_lamports,circuit_signature,circuit_at')
        .eq('circuit_status', 'sent')
        .order('circuit_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`purchases: ${error.message}`);
      all.push(...((data ?? []) as SentRow[]));
      if (!data || data.length < PAGE) break;
    }
    const [config, mine, tests, shop] = await Promise.all([loadConfig(db), wallet ? walletCircuit(db, wallet) : null, loadTestAccountIds(db), shopPriceRange(db)]);
    const outsideRows = all.filter((row) => !tests.has(row.user_id));
    const outside = circuitTotals(outsideRows);
    const purchaseLamports = all.reduce((sum, row) => sum + BigInt(row.lamports ?? 0), 0n);
    const testBuyers = new Set(all.filter((row) => tests.has(row.user_id)).map((row) => row.user_id)).size;
    // Off the response path: transfers that failed or never ran are taken up again (at most two per call).
    inBackground(retryCircuits(db));
    return json(
      {
        as_of: new Date().toISOString(),
        ...circuitTotals(all),
        purchase_lamports: Number(purchaseLamports),
        share_percent: Number(CIRCUIT_SHARE_PERCENT),
        stamp_fee_lamports: Number(STAMP_FEE_LAMPORTS),
        includes_team_tests: true,
        outside: { total_lamports: outside.total_lamports, purchases: outside.purchases, stamps_funded: outside.stamps_funded, test_accounts_left_out: testBuyers },
        shop,
        cluster: config.cluster ?? 'devnet',
        treasury: config.treasury ?? null,
        authority: config.authority ?? null,
        treasury_explorer_url: explorerUrl('address', config.treasury ?? null),
        authority_explorer_url: explorerUrl('address', config.authority ?? null),
        recent: all.slice(0, RECENT).map((row) => ({ at: row.circuit_at, lamports: Number(row.circuit_lamports), tx_signature: row.circuit_signature, explorer_url: explorerUrl('tx', row.circuit_signature) })),
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
