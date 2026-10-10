import { callerFailureStatus, resolveCaller } from '../_shared/caller.ts';
import { serviceClient } from '../_shared/db.ts';
import { verifyEd25519 } from '../_shared/ed25519.ts';
import { corsHeaders, isUuid, json, readJsonObject } from '../_shared/http.ts';
import { paymentRefusal, settlePurchase, type Settlement } from '../_shared/purchase-settle.ts';
import { verifyPayment } from '../_shared/purchase-verify.ts';
import { RpcError, RpcNodeError, rpc } from '../_shared/rpc.ts';
import { asParsedTransaction, decodeSignedTransaction, transactionSignature, type SignedTransaction } from '../_shared/signed-tx.ts';
import { base58Decode, base64Encode } from '../_shared/solana-tx.ts';

const MAX_BODY_BYTES = 4096;
const DETAIL_CHARS = 200;

/** Hands the signed transaction to the node. A transaction the chain already has counts as sent. */
async function broadcast(transaction: SignedTransaction): Promise<Settlement | null> {
  try {
    await rpc<string>('sendTransaction', [base64Encode(transaction.bytes), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
    return null;
  } catch (error) {
    if (error instanceof RpcNodeError) {
      if (/already been processed|already processed/i.test(error.nodeMessage)) return null;
      return { status: 422, body: { error: 'broadcast_failed', detail: error.nodeMessage.slice(0, DETAIL_CHARS) } };
    }
    if (!(error instanceof RpcError)) throw error;
    console.error('purchase-submit rpc failed', error.message);
    return { status: 503, body: { error: 'rpc_unavailable', retryable: true } };
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

    const body = await readJsonObject(request, MAX_BODY_BYTES);
    const intentId = body?.intent_id;
    if (!body || typeof intentId !== 'string' || !isUuid(intentId) || typeof body.signed_transaction !== 'string') {
      return json({ error: 'invalid_body' }, 400, cors);
    }
    const transaction = decodeSignedTransaction(body.signed_transaction);
    if (!transaction) return json({ error: 'invalid_transaction' }, 400, cors);

    const feePayer = base58Decode(transaction.accountKeys[0], 32);
    if (!feePayer || !(await verifyEd25519(feePayer, transaction.signatures[0], transaction.message))) {
      return json({ error: 'signature_invalid' }, 422, cors);
    }

    const signature = transactionSignature(transaction);
    let sent = false;
    const settlement = await settlePurchase(db, caller, {
      intentId,
      signature,
      lang: body.lang === 'en' ? 'en' : 'pt',
      beforeLookup: async (expected) => {
        const refusal = paymentRefusal(verifyPayment(asParsedTransaction(transaction), expected)) ?? (await broadcast(transaction));
        sent = refusal === null;
        return refusal;
      },
    });
    // A sent transaction the lookup did not see yet: the client can retry here or call `purchase-confirm`.
    const answer = sent && settlement.status !== 200 ? { ...settlement.body, signature } : settlement.body;
    return json(answer, settlement.status, cors);
  } catch (error) {
    console.error('purchase-submit failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
