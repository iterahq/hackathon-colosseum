/**
 * The learner's wallet signs a bounty step the backend built (accept, give up). The transaction's fee payer
 * is Itera's treasury, so the wallet needs no SOL: it only signs, and the backend adds the fee payer's
 * signature and sends. Nothing here broadcasts.
 */
import { base58Decode, base64Encode, normalizeSignOnlyAnswer } from '@/services/walletEncoding';
import { WalletSignError, classifyWalletError, connectWallet, getWalletProvider } from '@/services/walletSign';

export interface SignOffer {
  messageBase58: string;
  messageBase64: string;
  /** The wallet that must sign: the one the learner signed in with. */
  signer: string;
  feePayer: string;
}

export interface WalletSignedStep {
  message: string;
  signature: string;
}

const SIGNATURE_BYTES = 64;

/** A step failed in the wallet: `code` is one of `wallet_cancelled | no_wallet | wrong_wallet | wallet_failed`. */
export class BountySignError extends Error {
  constructor(
    readonly code: 'wallet_cancelled' | 'no_wallet' | 'wrong_wallet' | 'wallet_failed',
    detail = ''
  ) {
    super(detail || code);
  }
}

export function parseSignOffer(v: unknown): SignOffer | null {
  const r = (v ?? {}) as Record<string, unknown>;
  const text = (x: unknown) => (typeof x === 'string' && x ? x : null);
  const messageBase58 = text(r.message_base58);
  const messageBase64 = text(r.message_base64);
  const signer = text(r.signer);
  const feePayer = text(r.fee_payer);
  return messageBase58 && messageBase64 && signer && feePayer ? { messageBase58, messageBase64, signer, feePayer } : null;
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i]);

/**
 * The signer's 64 bytes out of a whole signed transaction (`[count][signatures][message]`), with the message
 * as the wallet signed it: a wallet may hand back the transaction, and may have added instructions of its own.
 */
export function signatureFromTransaction(transaction: Uint8Array, signer: string): { signature: Uint8Array; message: Uint8Array } | null {
  const count = transaction[0];
  if (!count || count >= 0x80) return null;
  const message = transaction.subarray(1 + count * SIGNATURE_BYTES);
  if (message.length < 4 + 32 * count || message[0] !== count) return null;
  const key = base58Decode(signer);
  for (let index = 0; index < count; index += 1) {
    if (!sameBytes(message.subarray(4 + 32 * index, 36 + 32 * index), key)) continue;
    const signature = transaction.subarray(1 + index * SIGNATURE_BYTES, 1 + (index + 1) * SIGNATURE_BYTES);
    return signature.some((byte) => byte !== 0) ? { signature, message } : null;
  }
  return null;
}

/** Asks the wallet to sign the offered message. Resolves with what the backend's `*_submit` step takes. */
export async function signOffer(offer: SignOffer): Promise<WalletSignedStep> {
  try {
    const connected = await connectWallet();
    if (connected !== offer.signer) throw new BountySignError('wrong_wallet', `connected ${connected ?? 'none'}, expected ${offer.signer}`);
    const provider = getWalletProvider();
    if (!provider) throw new BountySignError('no_wallet');
    const answer = normalizeSignOnlyAnswer(await provider.request({ method: 'signTransaction', params: { message: offer.messageBase58 } }));
    if (!answer) throw new BountySignError('wallet_failed', 'The wallet answered neither a signature nor a transaction.');
    if (answer.kind === 'signature') return { message: offer.messageBase64, signature: base64Encode(answer.signature) };
    const found = signatureFromTransaction(answer.transaction, offer.signer);
    if (!found) throw new BountySignError('wallet_failed', 'The wallet answered a transaction without its signature.');
    return { message: base64Encode(found.message), signature: base64Encode(found.signature) };
  } catch (e) {
    if (e instanceof BountySignError) throw e;
    const failure = e instanceof WalletSignError ? e : classifyWalletError(e);
    console.warn('[wallet]', 'bounty step', failure.reason, failure.detail);
    throw new BountySignError(failure.reason === 'cancelled' ? 'wallet_cancelled' : failure.reason === 'no_wallet' ? 'no_wallet' : 'wallet_failed', failure.detail);
  }
}

