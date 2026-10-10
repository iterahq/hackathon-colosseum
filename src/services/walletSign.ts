/**
 * The ONE place a purchase touches the injected Solana wallet (Phantom and compatibles). No web3
 * library: the backend builds a legacy transaction, the wallet signs and sends it.
 *
 * NOT YET PROVEN AGAINST A REAL PHANTOM. Three attempts, each logged (`[wallet] attempt <name>`), and
 * whatever the provider answers is carried in `WalletSignError.detail` so the failed state shows it.
 */
import { assembleSignedTransaction, base64Decode, base64Encode, normalizeSignOnlyAnswer } from '@/services/walletEncoding';
import type { PurchaseIntent } from '@/types/shop';

interface SolanaProvider {
  publicKey?: { toString(): string } | null;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<unknown>;
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  signAndSendTransaction?(transaction: unknown): Promise<unknown>;
}

export type WalletSignFailure = 'no_wallet' | 'cancelled' | 'insufficient' | 'failed';

export class WalletSignError extends Error {
  constructor(
    readonly reason: WalletSignFailure,
    /** `code: message` as the provider reported it. */
    readonly detail: string
  ) {
    super(detail || reason);
  }
}

const USER_REJECTED = 4001;

const isProvider = (p: unknown): p is SolanaProvider =>
  !!p && typeof (p as SolanaProvider).connect === 'function' && typeof (p as SolanaProvider).request === 'function';

/** Phantom's own namespace first, then the shared `window.solana` other wallets also fill. */
export function getWalletProvider(): SolanaProvider | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { phantom?: { solana?: unknown }; solana?: unknown };
  return isProvider(w.phantom?.solana) ? w.phantom.solana : isProvider(w.solana) ? w.solana : null;
}

export const hasWalletProvider = (): boolean => getWalletProvider() !== null;

const codeOf = (e: unknown): number | null => (typeof (e as { code?: unknown })?.code === 'number' ? (e as { code: number }).code : null);
const messageOf = (e: unknown): string => (e instanceof Error ? e.message : typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : String(e));

/** Maps whatever the wallet threw to one of our outcomes. Exported for the tests. */
export function classifyWalletError(e: unknown): WalletSignError {
  if (e instanceof WalletSignError) return e;
  const code = codeOf(e);
  const message = messageOf(e);
  const detail = code === null ? message : `${code}: ${message}`;
  if (code === USER_REJECTED || /user rejected|rejected the request|user denied|cancell?ed/i.test(message)) return new WalletSignError('cancelled', detail);
  if (/insufficient (funds|lamports|balance|sol)|attempt to debit an account|custom program error: 0x1\b/i.test(message)) return new WalletSignError('insufficient', detail);
  return new WalletSignError('failed', detail);
}

/** A wallet answers `{ signature }` or the bare string. */
const signatureOf = (answer: unknown): string | null => {
  if (typeof answer === 'string' && answer) return answer;
  const signature = (answer as { signature?: unknown } | null)?.signature;
  return typeof signature === 'string' && signature ? signature : null;
};

type Attempt = { name: string; run: () => Promise<WalletSigned> };

/** `sent`: the wallet broadcast the transaction. `signed`: the wallet only signed; the backend broadcasts (`purchase-submit`). */
export type WalletSigned = { kind: 'sent'; signature: string } | { kind: 'signed'; signedTransaction: string };

async function sent(answer: Promise<unknown>): Promise<WalletSigned> {
  const signature = signatureOf(await answer);
  if (!signature) throw new WalletSignError('failed', 'The wallet answered without a signature.');
  return { kind: 'sent', signature };
}

/**
 * 1. `request` — what Phantom's injected provider sends internally for a legacy transaction: the
 *    serialized MESSAGE in base58.
 * 2. `object` — FALLBACK, unproven: a duck-typed stand-in for a web3.js `Transaction` that can only
 *    hand back the bytes the backend serialized (message, and the transaction with one empty
 *    signature slot). If the wallet needs more than that, it throws and the learner sees that error.
 * 3. `sign` — LAST RESORT, only after 1 and 2 failed for another reason than a rejection: the wallet
 *    signs the message and does not send; the signed transaction goes to `purchase-submit`.
 */
function attemptsFor(provider: SolanaProvider, intent: PurchaseIntent): Attempt[] {
  const messageBytes = intent.messageBase64 ? base64Decode(intent.messageBase64) : null;
  const attempts: Attempt[] = [
    { name: 'request', run: () => sent(provider.request({ method: 'signAndSendTransaction', params: { message: intent.messageBase58 || intent.transactionBase58 } })) },
  ];
  const send = provider.signAndSendTransaction?.bind(provider);
  if (send && messageBytes && intent.transactionBase64) {
    const transactionBytes = base64Decode(intent.transactionBase64);
    attempts.push({ name: 'object', run: () => sent(send({ serializeMessage: () => messageBytes, serialize: () => transactionBytes, signatures: [], feePayer: undefined })) });
  }
  if (messageBytes && intent.messageBase58) {
    attempts.push({
      name: 'sign',
      run: async () => {
        const answer = normalizeSignOnlyAnswer(await provider.request({ method: 'signTransaction', params: { message: intent.messageBase58 } }));
        if (!answer) throw new WalletSignError('failed', 'The wallet signed but answered neither a signature nor a transaction.');
        const signed = answer.kind === 'signature' ? assembleSignedTransaction(answer.signature, messageBytes) : answer.transaction;
        return { kind: 'signed', signedTransaction: base64Encode(signed) };
      },
    });
  }
  return attempts;
}

export async function connectWallet(): Promise<string | null> {
  const provider = getWalletProvider();
  if (!provider) throw new WalletSignError('no_wallet', 'No Solana wallet found in this browser.');
  try {
    await provider.connect({ onlyIfTrusted: true }).catch(() => provider.connect());
  } catch (e) {
    console.warn('[wallet]', 'connect', codeOf(e), messageOf(e));
    throw classifyWalletError(e);
  }
  return provider.publicKey?.toString() ?? null;
}

/** Asks the wallet to sign and send the intent's transaction, or failing that to only sign it. */
export async function signAndSendPurchase(intent: PurchaseIntent): Promise<WalletSigned> {
  const provider = getWalletProvider();
  if (!provider) throw new WalletSignError('no_wallet', 'No Solana wallet found in this browser.');
  const failures: string[] = [];
  for (const attempt of attemptsFor(provider, intent)) {
    console.info('[wallet] attempt', attempt.name);
    try {
      return await attempt.run();
    } catch (e) {
      console.warn('[wallet]', attempt.name, codeOf(e), messageOf(e));
      const failure = classifyWalletError(e);
      // "No" from the learner, or an empty wallet, is an answer: never ask a second time.
      if (failure.reason !== 'failed') throw failure;
      failures.push(`${attempt.name} → ${failure.detail}`);
    }
  }
  throw new WalletSignError('failed', failures.join(' | '));
}
