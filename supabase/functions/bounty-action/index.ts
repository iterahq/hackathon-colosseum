import { isEd25519Address } from '../_shared/address.ts';
import { createFor, escrowRentLamports, readEscrow } from '../_shared/bounty-chain.ts';
import { escrowBalance } from '../_shared/bounty-escrow.ts';
import { escrowTerms, loadBounty, refreshFunding } from '../_shared/bounty-store.ts';
import {
  bountyActionCompleted,
  bountyActionError,
  bountyActionGet,
  bountyActionPost,
  bountyActionUrl,
  fundingCost,
  fundingTarget,
  publicStatus,
  transferMemo,
  type BountyActionError,
  type BountyRow,
} from '../_shared/bounty.ts';
import { loadConfig, serviceClient, type IteraClient } from '../_shared/db.ts';
import { compileMessage, memoInstruction } from '../_shared/solana-message.ts';
import { actionHeaders, type Lang } from '../_shared/gift.ts';
import { functionsBase, isUuid, langOf, pathAfter, readJsonObject } from '../_shared/http.ts';
import { fundsCheck } from '../_shared/purchase-verify.ts';
import { callerAddress, takeRate, tooMany, type RateLimit } from '../_shared/ratelimit.ts';
import { RpcError, balanceOf, latestBlockhash } from '../_shared/rpc.ts';
import { base64Encode, buildTransferMessage, isSignature, serializeTransaction } from '../_shared/solana-tx.ts';

const FUNCTION = 'bounty-action';
const SLUG = /^[a-z0-9][a-z0-9-]{2,62}$/;
/** How long the callback waits for the escrow balance to show the payment. */
const CONFIRM_WAIT_MS = 8_000;
const CONFIRM_POLL_MS = 1_000;
/** Every call here reads the chain, and the confirmation polls it: few per caller. */
const RATE: RateLimit = { limit: 30, windowMs: 60_000 };

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...actionHeaders(), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const refuse = (code: BountyActionError, lang: Lang, status: number) => answer(bountyActionError(code, lang), status);

function fundable(bounty: BountyRow): boolean {
  return publicStatus(bounty, new Date()) === 'awaiting_funding';
}

async function describe(bounty: BountyRow, lang: Lang): Promise<Response> {
  return answer(
    bountyActionGet({
      bounty,
      lang,
      // The label is the only thing here that needs the node: without it the button shows the reward alone.
      missingLamports: fundingCost(bounty, bounty.escrow_kind === 'program' ? await escrowRentLamports(bounty.escrow_gated).catch(() => 0n) : 0n),
      href: bountyActionUrl(functionsBase(), bounty.slug, lang),
      blocked: fundable(bounty) ? null : 'not_fundable',
    }),
  );
}

async function build(db: IteraClient, bounty: BountyRow, request: Request, lang: Lang): Promise<Response> {
  const body = await readJsonObject(request);
  const account = body?.account;
  if (!isEd25519Address(account) || account === bounty.escrow_address) return refuse('invalid_account', lang, 400);
  // Decided from our table alone: a closed bounty costs the node nothing.
  if (!fundable(bounty)) return refuse('not_fundable', lang, 400);

  let message: Uint8Array;
  if (bounty.escrow_kind === 'program') {
    // The payer creates the bounty's account on the escrow program, with the terms this bounty was posted with.
    const terms = await escrowTerms(bounty, await loadConfig(db));
    if (!terms) return refuse('unavailable', lang, 503);
    const [existing, balance, latest, rent] = await Promise.all([readEscrow(terms.programId, bounty.escrow_address), balanceOf(account), latestBlockhash(), escrowRentLamports(terms.gate !== null)]);
    if (existing) return refuse('not_fundable', lang, 400);
    if (!fundsCheck(balance, fundingCost(bounty, rent)).ok) return refuse('insufficient_funds', lang, 400);
    message = compileMessage(account, [createFor(terms, account), memoInstruction(transferMemo(bounty.id, 'fund'))], latest.blockhash);
  } else {
    const [held, balance, latest] = await Promise.all([escrowBalance(bounty.escrow_address), balanceOf(account), latestBlockhash()]);
    const missing = fundingTarget(bounty.reward_lamports) - held;
    if (missing <= 0n) return refuse('not_fundable', lang, 400);
    if (!fundsCheck(balance, missing).ok) return refuse('insufficient_funds', lang, 400);
    message = buildTransferMessage({ payer: account, recipient: bounty.escrow_address, lamports: missing, memo: transferMemo(bounty.id, 'fund'), recentBlockhash: latest.blockhash });
  }
  return answer(
    bountyActionPost({
      bounty,
      lang,
      transactionBase64: base64Encode(serializeTransaction(message)),
      callbackHref: `${functionsBase()}/${FUNCTION}/confirm?bounty=${bounty.id}&lang=${lang}`,
    }),
  );
}

/** Action chaining: the client posts here once the wallet sent the transaction. The escrow balance decides, not the body. */
async function confirm(db: IteraClient, request: Request, lang: Lang): Promise<Response> {
  const bountyId = new URL(request.url).searchParams.get('bounty') ?? '';
  const body = await readJsonObject(request);
  if (!isUuid(bountyId) || !isEd25519Address(body?.account) || !isSignature(body?.signature)) return refuse('invalid_body', lang, 400);
  let bounty = await loadBounty(db, { id: bountyId });
  if (!bounty) return refuse('not_found', lang, 404);
  const deadline = Date.now() + CONFIRM_WAIT_MS;
  while (bounty.status === 'awaiting_funding') {
    bounty = await refreshFunding(db, bounty);
    if (bounty.status !== 'awaiting_funding' || Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_POLL_MS));
  }
  return answer(bountyActionCompleted({ lang, funded: bounty.status !== 'awaiting_funding' }));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: actionHeaders() });
  const lang = langOf(request, 'en');
  try {
    const [first, ...rest] = pathAfter(request, FUNCTION);
    const db = serviceClient();
    const verdict = await takeRate(db, FUNCTION, callerAddress(request), RATE);
    if (!verdict.allowed) return tooMany(verdict, actionHeaders());
    if (first === 'confirm' && rest.length === 0) {
      return request.method === 'POST' ? await confirm(db, request, lang) : refuse('invalid_body', lang, 405);
    }
    if (rest.length > 0 || !first || !(isUuid(first) || SLUG.test(first))) return refuse('not_found', lang, 404);
    const bounty = await loadBounty(db, isUuid(first) ? { id: first } : { slug: first });
    if (!bounty) return refuse('not_found', lang, 404);
    if (request.method === 'GET') return await describe(bounty, lang);
    if (request.method === 'POST') return await build(db, bounty, request, lang);
    return refuse('invalid_body', lang, 405);
  } catch (error) {
    if (error instanceof RpcError) {
      console.error('bounty-action rpc failed', error.message);
      return refuse('unavailable', lang, 503);
    }
    console.error('bounty-action failed', error);
    return refuse('unavailable', lang, 500);
  }
});
