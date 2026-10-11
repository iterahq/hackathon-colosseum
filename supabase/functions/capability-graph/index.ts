import { isSolanaAddress } from '../_shared/address.ts';
import { ITERA_V2_GRAPH } from '../_shared/capability-graph.ts';
import { buildGraph, type GraphProof } from '../_shared/claims.ts';
import { loadRecordedProofs } from '../_shared/claims-store.ts';
import { explorerUrl } from '../_shared/credential.ts';
import { serviceClient } from '../_shared/db.ts';
import { corsHeaders, json, langOf, pathAfter } from '../_shared/http.ts';
import { callerAddress, takeRate, tooMany, type RateLimit } from '../_shared/ratelimit.ts';

const RATE: RateLimit = { limit: 120, windowMs: 60_000 };

/**
 * GET /capability-graph/<wallet>: the graph as our tables hold it, with no
 * chain read and no Solana SDK in the bundle, so it answers fast. Nothing here
 * is `verified`: a claim we recorded reads `recorded` and carries the asset and
 * the hash a reader needs to check the chain. `learner-profile` is the answer
 * that read the chain.
 */
Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'public');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const [wallet, ...rest] = pathAfter(request, 'capability-graph');
    if (!isSolanaAddress(wallet) || rest.length > 0) return json({ error: 'invalid_address' }, 400, cors);
    const db = serviceClient();
    const [verdict, recorded] = await Promise.all([takeRate(db, 'capability-graph', callerAddress(request), RATE), loadRecordedProofs(db, wallet)]);
    if (!verdict.allowed) return tooMany(verdict, cors);

    const lang = langOf(request, 'pt');
    const proofs = new Map<string, GraphProof>();
    for (const row of recorded) {
      if (!proofs.has(row.claim_id)) proofs.set(row.claim_id, { asset: row.asset, onchain_value: null, evidence_hash: row.evidence_hash, tx_signature: row.tx_signature, proven_at: row.proven_at });
    }
    const graph = buildGraph({
      graph: ITERA_V2_GRAPH,
      lang,
      trails: ITERA_V2_GRAPH.trails.map((title, trail) => ({ trail, title: title[lang] ?? title.en })),
      proofs,
      explorer: explorerUrl,
    });
    return json({ wallet, source: 'database', capabilities: graph }, 200, { ...cors, 'Cache-Control': 'public, max-age=10' });
  } catch (error) {
    console.error('capability-graph failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
