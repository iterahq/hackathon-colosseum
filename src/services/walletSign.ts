/**
 * The ONE place a purchase touches the injected Solana wallet (Phantom and compatibles). No web3
 * library: the backend builds the transaction, the wallet signs and sends its serialized MESSAGE.
 *
 * NOT YET PROVEN AGAINST A REAL PHANTOM. Every provider error is logged with its code and message
 * and carried in `WalletSignError.detail`, so the failed state can show exactly what the wallet said.
 */
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
const METHOD_UNSUPPORTED = new Set([-32601, -32602]);

export function getWalletProvider(): SolanaProvider | null {
  const provider = typeof window === 'undefined' ? undefined : (window as unknown as { solana?: SolanaProvider }).solana;
  return provider && typeof provider.connect === 'function' && typeof provider.request === 'function' ? provider : null;
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

const signatureOf = (answer: unknown): string | null => {
  if (typeof answer === 'string' && answer) return answer;
  const signature = (answer as { signature?: unknown } | null)?.signature;
  return typeof signature === 'string' && signature ? signature : null;
};

function bytesFromBase64(base64: string): Uint8Array {
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * FALLBACK PATH — unproven, taken only when the wallet says it does not support the `request`
 * form. Without a web3 library there is no real Transaction object, so this hands the provider a
 * minimal stand-in that can only return the bytes the backend serialized. If the wallet needs more
 * than `serialize()`, it throws and that error is what the learner sees.
 */
async function sendWithTransactionObject(provider: SolanaProvider, intent: PurchaseIntent): Promise<string | null> {
  if (typeof provider.signAndSendTransaction !== 'function' || !intent.transactionBase64) return null;
  const bytes = bytesFromBase64(intent.transactionBase64);
  return signatureOf(await provider.signAndSendTransaction({ serialize: () => bytes, signatures: [] }));
}

export async function connectWallet(): Promise<string | null> {
  const provider = getWalletProvider();
  if (!provider) throw new WalletSignError('no_wallet', 'No Solana wallet found in this browser.');
  try {
    await provider.connect({ onlyIfTrusted: true }).catch(() => provider.connect());
  } catch (e) {
    console.error('[wallet] connect failed', { code: codeOf(e), message: messageOf(e) });
    throw classifyWalletError(e);
  }
  return provider.publicKey?.toString() ?? null;
}

/** Asks the wallet to sign and send the intent's transaction; resolves with the transaction signature. */
export async function signAndSendPurchase(intent: PurchaseIntent): Promise<string> {
  const provider = getWalletProvider();
  if (!provider) throw new WalletSignError('no_wallet', 'No Solana wallet found in this browser.');
  const message = intent.messageBase58 || intent.transactionBase58;
  try {
    const signature = signatureOf(await provider.request({ method: 'signAndSendTransaction', params: { message } }));
    if (signature) return signature;
    throw new WalletSignError('failed', 'The wallet answered without a signature.');
  } catch (e) {
    console.error('[wallet] signAndSendTransaction failed', { code: codeOf(e), message: messageOf(e) });
    const failure = classifyWalletError(e);
    const code = codeOf(e);
    if (failure.reason !== 'failed' || code === null || !METHOD_UNSUPPORTED.has(code)) throw failure;
    try {
      const signature = await sendWithTransactionObject(provider, intent);
      if (signature) return signature;
    } catch (fallbackError) {
      console.error('[wallet] fallback signAndSendTransaction(object) failed', { code: codeOf(fallbackError), message: messageOf(fallbackError) });
      throw classifyWalletError(fallbackError);
    }
    throw failure;
  }
}
