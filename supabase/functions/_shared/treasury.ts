import { latestBlockhash, rpc } from './rpc.ts';
import { base58Decode, base58Encode, base64Encode, buildTransferMessage, serializeTransaction } from './solana-tx.ts';

const CONFIRM_TIMEOUT_MS = 30_000;
const CONFIRM_POLL_MS = 700;
export const PKCS8_ED25519_PREFIX = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];

export class TreasuryNotConfiguredError extends Error {}

export interface TransferSigner {
  address: string;
  key: CryptoKey;
}

function secretFrom(name: string): Uint8Array {
  const raw = Deno.env.get(name)?.trim();
  if (!raw) throw new TreasuryNotConfiguredError(`${name} is not set`);
  let secret: Uint8Array | null;
  try {
    secret = raw.startsWith('[') ? Uint8Array.from(JSON.parse(raw)) : base58Decode(raw, 64);
  } catch {
    secret = null;
  }
  if (!secret || secret.length !== 64) throw new TreasuryNotConfiguredError(`${name} must be a 64-byte secret key`);
  return secret;
}

/** The 32-byte seed of the treasury key. Only ever used to derive other keys (`bounty-escrow.ts`). */
export function treasurySeed(): Uint8Array {
  return secretFrom('SOLANA_TREASURY_SECRET').slice(0, 32);
}

export function signerFromSeed(seed: Uint8Array, address: string): Promise<TransferSigner> {
  return crypto.subtle
    .importKey('pkcs8', Uint8Array.from([...PKCS8_ED25519_PREFIX, ...seed]), { name: 'Ed25519' }, false, ['sign'])
    .then((key) => ({ address, key }));
}

/** The treasury keypair from `SOLANA_TREASURY_SECRET` (64 bytes as a JSON array or base58). */
export function treasurySigner(): Promise<TransferSigner> {
  const secret = secretFrom('SOLANA_TREASURY_SECRET');
  return signerFromSeed(secret.slice(0, 32), base58Encode(secret.slice(32)));
}

/**
 * The transfer was handed to the node and then failed or was not seen
 * confirmed. It may still land: the caller must not send it again without
 * asking the chain about `signature` first.
 */
export class TransferBroadcastError extends Error {
  constructor(readonly signature: string, message: string) {
    super(message);
  }
}

export interface TreasuryTransfer {
  recipient: string;
  lamports: bigint;
  memo: string;
  /** Called with the signature as soon as the node accepted the transaction, before it is confirmed. */
  onBroadcast?: (signature: string) => Promise<void>;
}

/**
 * Signs a message with `signer` (its only signer), sends it and waits for
 * confirmation. Returns the signature. Throws `TransferBroadcastError` for any
 * failure after the node accepted the transaction; any other error means
 * nothing was sent.
 */
export async function sendMessage(
  signer: TransferSigner,
  messageOf: (recentBlockhash: string) => Uint8Array,
  onBroadcast?: (signature: string) => Promise<void>,
): Promise<string> {
  const { blockhash } = await latestBlockhash();
  const message = messageOf(blockhash);
  return broadcast(serializeTransaction(message, await signMessage(signer, message)), onBroadcast);
}

export async function signMessage(signer: TransferSigner, message: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign('Ed25519', signer.key, message as Uint8Array<ArrayBuffer>));
}

/**
 * Hands a fully signed transaction to the node and waits for confirmation.
 * Same contract as `sendMessage`: `TransferBroadcastError` for any failure
 * after the node accepted it; any other error means nothing was sent.
 */
export async function broadcast(transaction: Uint8Array, onBroadcast?: (signature: string) => Promise<void>): Promise<string> {
  const sent = await rpc<string>('sendTransaction', [base64Encode(transaction), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
  try {
    await onBroadcast?.(sent);
    const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const statuses = await rpc<{ value: Array<{ err: unknown; confirmationStatus?: string } | null> }>('getSignatureStatuses', [[sent]]);
      const status = statuses.value[0];
      if (status?.err) throw new Error(`transaction ${sent} failed`);
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return sent;
      await new Promise((resolve) => setTimeout(resolve, CONFIRM_POLL_MS));
    }
    throw new Error(`transaction ${sent} was not confirmed in time`);
  } catch (error) {
    throw new TransferBroadcastError(sent, error instanceof Error ? error.message : String(error));
  }
}

/** Sends lamports from `signer` (fee payer and source). Same contract as `sendMessage`. */
export function sendTransfer(signer: TransferSigner, input: TreasuryTransfer): Promise<string> {
  return sendMessage(
    signer,
    (recentBlockhash) => buildTransferMessage({ payer: signer.address, recipient: input.recipient, lamports: input.lamports, memo: input.memo, recentBlockhash }),
    input.onBroadcast,
  );
}

export type SignatureFate = 'landed' | 'failed' | 'in_flight' | 'unknown';

/**
 * What became of a transaction the treasury sent earlier. `unknown`: the node
 * has no record of it, which after the blockhash window means it never will.
 */
export async function signatureFate(signature: string): Promise<SignatureFate> {
  const statuses = await rpc<{ value: Array<{ err: unknown; confirmationStatus?: string } | null> }>('getSignatureStatuses', [
    [signature],
    { searchTransactionHistory: true },
  ]);
  const status = statuses.value[0];
  if (!status) return 'unknown';
  if (status.err) return 'failed';
  return status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized' ? 'landed' : 'in_flight';
}

/** Sends lamports from the treasury. Same contract as `sendTransfer`. */
export async function sendFromTreasury(input: TreasuryTransfer): Promise<string> {
  return sendTransfer(await treasurySigner(), input);
}

/** The mint authority's address, read from the authority's own secret (bytes 32..64 are the public key). */
export function authorityAddress(): string {
  return base58Encode(secretFrom('SOLANA_AUTHORITY_SECRET').slice(32));
}

export async function treasuryAddress(): Promise<string> {
  return (await treasurySigner()).address;
}

/**
 * Treasury -> mint authority, the only route of the Circuito. There is no
 * recipient parameter on purpose: the destination is the authority key this
 * project signs mints with, whatever the caller holds.
 */
export async function sendToAuthority(input: { lamports: bigint; memo: string; onBroadcast?: (signature: string) => Promise<void> }): Promise<string> {
  const recipient = authorityAddress();
  if (recipient === (await treasuryAddress())) throw new TreasuryNotConfiguredError('treasury and authority are the same key');
  if (input.lamports <= 0n) throw new Error('nothing to send');
  return sendFromTreasury({ recipient, lamports: input.lamports, memo: input.memo, onBroadcast: input.onBroadcast });
}
