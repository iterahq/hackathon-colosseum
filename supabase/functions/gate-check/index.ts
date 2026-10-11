import { isSolanaAddress } from '../_shared/address.ts';
import { readEscrow, acceptPlan } from '../_shared/bounty-chain.ts';
import { ESCROW_ERRORS } from '../_shared/bounty-program.ts';
import { explorerUrl } from '../_shared/credential.ts';
import { loadTestAccountIds } from '../_shared/test-accounts.ts';
import { loadConfig, serviceClient, type IteraClient } from '../_shared/db.ts';
import { corsHeaders, json, langOf } from '../_shared/http.ts';
import { callerAddress, takeRate, tooMany, type RateLimit } from '../_shared/ratelimit.ts';
import { RpcError, latestBlockhash, rpc, rpcUrl, withinMs } from '../_shared/rpc.ts';
import { compileMessage, requiredSignatures } from '../_shared/solana-message.ts';
import { SIGNATURE_BYTES, base58Encode, base64Encode, compactU16 } from '../_shared/solana-tx.ts';
import { signMessage, treasurySigner } from '../_shared/treasury.ts';

/**
 * The escrow program refusing a wallet, where anyone can watch it.
 *
 * `GET /gate-check?wallet=<address>`: builds the same `accept` instruction the bounty page builds, for
 * an open bounty whose days the program checks itself, and asks the Solana node to run it
 * (`simulateTransaction`, signatures not checked). No key is needed to ask, so any wallet can be named.
 * A wallet with no certification of its own is given another learner's real one: the program's own
 * answer is the point. The transaction bytes are returned so the same question can be put to any node.
 *
 * `GET /gate-check?direct=1[&wallet=<address>]`: the same question for an open DIRECT bounty (one address invited, read from the
 * 260-byte account), asked as a wallet that is not the invitee. The program answers NotInvited (6020). Simulated only.
 *
 * `GET /gate-check?send=1`: the same, sent for real. A key made for this one call signs as the taker and
 * Itera pays the fee; the program fails the transaction on chain and it can be opened in an explorer.
 */
const FUNCTION = 'gate-check';
const READ_RATE: RateLimit = { limit: 30, windowMs: 60_000 };
const SEND_RATE: RateLimit = { limit: 4, windowMs: 60 * 60_000 };
/** Everyone's sends together: each one costs the treasury two signatures of fee. */
const SEND_RATE_ALL: RateLimit = { limit: 60, windowMs: 60 * 60_000 };
const CONFIRM_BUDGET_MS = 12_000;
const ZERO_BLOCKHASH = '11111111111111111111111111111111';

interface BountyPick {
  origin?: string;
  created_by?: string | null;
  slug: string;
  slug_en: string | null;
  title_i18n: Record<string, string>;
  escrow_address: string;
  requirement: { unit_id: string; trail: string; min_days: number; trail_title: Record<string, string> };
}

/** An open bounty the program gates by itself: the judge bounty when one is free, else the newest. */
async function pickBounty(db: IteraClient): Promise<BountyPick | null> {
  const { data, error } = await db
    .from('bounties')
    .select('slug,slug_en,title_i18n,escrow_address,requirement,template_key,created_at')
    .eq('status', 'open')
    .eq('escrow_kind', 'program')
    .eq('escrow_gated', true)
    .eq('is_test', false)
    .is('hidden_at', null)
    .gt('expires_at', new Date(Date.now() + 5 * 60_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw new Error(`bounties gate: ${error.message}`);
  const rows = (data ?? []) as unknown as Array<BountyPick & { template_key: string | null }>;
  return rows.find((row) => row.template_key !== null) ?? rows[0] ?? null;
}

/** The newest open direct bounty. The team's own test ones count here: the page says so through `team_test`. */
async function pickDirectBounty(db: IteraClient): Promise<BountyPick | null> {
  const { data, error } = await db
    .from('bounties')
    .select('slug,slug_en,title_i18n,escrow_address,requirement,origin,created_by,created_at')
    .eq('status', 'open')
    .eq('escrow_kind', 'program')
    .not('invitee_wallet', 'is', null)
    .is('hidden_at', null)
    .gt('expires_at', new Date(Date.now() + 5 * 60_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw new Error(`bounties direct gate: ${error.message}`);
  return ((data ?? []) as unknown as BountyPick[])[0] ?? null;
}

type CertificationKind = 'own' | 'another_wallets' | 'not_a_certification';

/** The certification account handed to the program: the wallet's own for this trail, else another learner's, else no certification at all. */
async function pickCertification(db: IteraClient, wallet: string, unitId: string): Promise<{ address: string; kind: CertificationKind }> {
  const minted = () => db.from('user_achievements').select('asset_address,wallet_address').eq('achievement_key', 'trail_pass').eq('mint_status', 'minted').eq('ref_id', unitId).not('asset_address', 'is', null);
  const own = await minted().eq('wallet_address', wallet).limit(1);
  if (own.error) throw new Error(`certification own: ${own.error.message}`);
  const mine = (own.data ?? [])[0] as { asset_address: string } | undefined;
  if (mine) return { address: mine.asset_address, kind: 'own' };
  const other = await minted().neq('wallet_address', wallet).order('minted_at', { ascending: false }).limit(1);
  if (other.error) throw new Error(`certification other: ${other.error.message}`);
  const theirs = (other.data ?? [])[0] as { asset_address: string } | undefined;
  return theirs ? { address: theirs.asset_address, kind: 'another_wallets' } : { address: wallet, kind: 'not_a_certification' };
}

interface Simulation {
  err: unknown;
  logs: string[] | null;
  unitsConsumed?: number;
}

/** The program's own error number in a node's `err`, when the failure is one of its custom errors. */
function customError(err: unknown): number | null {
  const instruction = (err as { InstructionError?: [number, unknown] } | null)?.InstructionError;
  const custom = Array.isArray(instruction) ? (instruction[1] as { Custom?: unknown } | null)?.Custom : undefined;
  return typeof custom === 'number' ? custom : null;
}

function verdictOf(err: unknown) {
  const code = customError(err);
  return {
    refused: err !== null && err !== undefined,
    error_code: code,
    error_hex: code === null ? null : `0x${code.toString(16)}`,
    error_name: code === null ? null : (ESCROW_ERRORS[code] ?? null),
    raw: err ?? null,
  };
}

/** A legacy transaction with every signature slot zeroed: enough for a node asked not to check signatures. */
function unsigned(message: Uint8Array): Uint8Array {
  const slots = requiredSignatures(message);
  return Uint8Array.from([...compactU16(slots), ...new Uint8Array(slots * SIGNATURE_BYTES), ...message]);
}

const curlFor = (transaction: string) =>
  `curl -s ${rpcUrl()} -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"simulateTransaction","params":["${transaction}",{"encoding":"base64","sigVerify":false,"replaceRecentBlockhash":true,"commitment":"confirmed"}]}'`;

async function throwawayKey(): Promise<{ address: string; sign: (message: Uint8Array) => Promise<Uint8Array> }> {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const address = base58Encode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  return { address, sign: async (message) => new Uint8Array(await crypto.subtle.sign('Ed25519', pair.privateKey, message as Uint8Array<ArrayBuffer>)) };
}

/** Whether the transaction is on chain, and how it ended; `null` when the node has not said within the budget. */
async function fateOf(signature: string): Promise<{ err: unknown } | null> {
  const deadline = Date.now() + CONFIRM_BUDGET_MS;
  while (Date.now() < deadline) {
    const statuses = await rpc<{ value: Array<{ err: unknown; confirmationStatus?: string } | null> }>('getSignatureStatuses', [[signature]]);
    const status = statuses.value[0];
    if (status && (status.err || status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) return { err: status.err ?? null };
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  return null;
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'public');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);
  try {
    const url = new URL(request.url);
    const named = url.searchParams.get('wallet');
    const send = url.searchParams.get('send') === '1';
    if (named !== null && !isSolanaAddress(named)) return json({ error: 'invalid_address' }, 400, cors);
    if (send && named !== null) return json({ error: 'send_takes_no_wallet' }, 400, cors);
    const direct = url.searchParams.get('direct') === '1';
    if (direct && send) return json({ error: 'direct_is_simulated_only' }, 400, cors);

    const db = serviceClient();
    const caller = callerAddress(request);
    const reads = await takeRate(db, FUNCTION, caller, READ_RATE);
    if (!reads.allowed) return tooMany(reads, cors);
    if (send) {
      const mine = await takeRate(db, `${FUNCTION}-send`, caller, SEND_RATE);
      if (!mine.allowed) return tooMany(mine, cors);
      const all = await takeRate(db, `${FUNCTION}-send`, 'everyone', SEND_RATE_ALL);
      if (!all.allowed) return tooMany(all, cors);
    }

    const missing = direct ? 'no_direct_bounty_open' : 'no_gated_bounty_open';
    const [config, bounty] = await Promise.all([loadConfig(db), direct ? pickDirectBounty(db) : pickBounty(db)]);
    const programId = config.bounty_escrow_program;
    if (!programId || !bounty) return json({ error: missing }, 404, cors);
    const state = await readEscrow(programId, bounty.escrow_address);
    if (!state || state.status !== 'open' || !state.gate || (direct && !state.invitee)) return json({ error: missing }, 404, cors);
    if (direct && named === state.invitee) return json({ error: 'named_is_the_invitee' }, 400, cors);

    const lang = langOf(request, 'en');
    const key = send ? await throwawayKey() : null;
    const claimant = key?.address ?? named ?? (await throwawayKey()).address;
    const tests = direct ? await loadTestAccountIds(db) : new Set<string>();
    const certification = await pickCertification(db, claimant, bounty.requirement.unit_id);
    const payer = await treasurySigner();
    const plan = acceptPlan(state, { programId, approver: state.approver, attester: payer.address, escrow: bounty.escrow_address }, claimant, certification.address);
    if (plan === 'closed') return json({ error: missing }, 404, cors);

    const facts = {
      cluster: 'devnet',
      program_id: programId,
      program_url: explorerUrl('address', programId),
      bounty: { slug: lang === 'en' && bounty.slug_en ? bounty.slug_en : bounty.slug, title: bounty.title_i18n[lang] ?? bounty.title_i18n.pt ?? bounty.slug, trail: bounty.requirement.trail_title[lang] ?? bounty.requirement.trail, min_days: bounty.requirement.min_days },
      ...(direct ? { direct: { invitee: state.invitee, invitee_url: explorerUrl('address', state.invitee as string), team_test: bounty.origin === 'wallet' && tests.has(bounty.created_by ?? '') } } : {}),
      escrow: bounty.escrow_address,
      escrow_url: explorerUrl('address', bounty.escrow_address),
      claimant: { address: claimant, kind: named ? 'named' : 'made_for_this_check' },
      certification: { address: certification.address, kind: certification.kind, url: explorerUrl('address', certification.address) },
      rpc_url: rpcUrl(),
    };

    if (!key) {
      const blockhash = (await withinMs(latestBlockhash().catch(() => null), 1_500))?.blockhash ?? ZERO_BLOCKHASH;
      const transaction = base64Encode(unsigned(compileMessage(payer.address, plan, blockhash)));
      const result = await rpc<{ value: Simulation }>('simulateTransaction', [transaction, { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed' }]);
      return json(
        { ...facts, mode: 'simulated', verdict: verdictOf(result.value.err), logs: result.value.logs ?? [], units_consumed: result.value.unitsConsumed ?? null, transaction_base64: transaction, repeat_with: curlFor(transaction) },
        200,
        { ...cors, 'Cache-Control': 'no-store' },
      );
    }

    // Sent for real, with no preflight: the node would refuse to forward a transaction it knows will fail, and the point is to see it fail on chain.
    const { blockhash } = await latestBlockhash();
    const message = compileMessage(payer.address, plan, blockhash);
    if (requiredSignatures(message) !== 2) throw new Error('gate-check: unexpected signer set');
    const signatures = [await signMessage(payer, message), await key.sign(message)];
    const wire = Uint8Array.from([...compactU16(2), ...signatures[0], ...signatures[1], ...message]);
    const signature = await rpc<string>('sendTransaction', [base64Encode(wire), { encoding: 'base64', skipPreflight: true, maxRetries: 3 }]);
    const fate = await fateOf(signature);
    return json(
      {
        ...facts,
        mode: 'sent',
        signature,
        explorer_url: explorerUrl('tx', signature),
        landed: fate !== null,
        verdict: fate ? verdictOf(fate.err) : null,
        fee_paid_by: payer.address,
      },
      200,
      { ...cors, 'Cache-Control': 'no-store' },
    );
  } catch (error) {
    if (error instanceof RpcError) {
      console.error('gate-check rpc failed', error.message);
      return json({ error: 'upstream_unavailable' }, 502, cors);
    }
    console.error('gate-check failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
