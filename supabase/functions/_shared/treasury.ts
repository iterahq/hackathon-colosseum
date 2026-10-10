import { latestBlockhash, rpc } from './rpc.ts';
import { base58Decode, base58Encode, base64Encode, buildTransferMessage, serializeTransaction } from './solana-tx.ts';

const CONFIRM_TIMEOUT_MS = 30_000;
const CONFIRM_POLL_MS = 700;
const PKCS8_ED25519_PREFIX = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];

export class TreasuryNotConfiguredError extends Error {}

interface Treasury {
  address: string;
  key: CryptoKey;
}

/** The treasury keypair from `SOLANA_TREASURY_SECRET` (64 bytes as a JSON array or base58). */
async function loadTreasury(): Promise<Treasury> {
  const raw = Deno.env.get('SOLANA_TREASURY_SECRET')?.trim();
  if (!raw) throw new TreasuryNotConfiguredError('SOLANA_TREASURY_SECRET is not set');
  let secret: Uint8Array | null;
  try {
    secret = raw.startsWith('[') ? Uint8Array.from(JSON.parse(raw)) : base58Decode(raw, 64);
  } catch {
    secret = null;
  }
  if (!secret || secret.length !== 64) throw new TreasuryNotConfiguredError('SOLANA_TREASURY_SECRET must be a 64-byte secret key');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from([...PKCS8_ED25519_PREFIX, ...secret.slice(0, 32)]),
    { name: 'Ed25519' },
    false,
    ['sign'],
  );
  return { address: base58Encode(secret.slice(32)), key };
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
 * Sends lamports from the treasury and waits for confirmation. Returns the
 * signature. Throws `TransferBroadcastError` for any failure after the node
 * accepted the transaction; any other error means nothing was sent.
 */
export async function sendFromTreasury(input: TreasuryTransfer): Promise<string> {
  const treasury = await loadTreasury();
  const { blockhash } = await latestBlockhash();
  const message = buildTransferMessage({
    payer: treasury.address,
    recipient: input.recipient,
    lamports: input.lamports,
    memo: input.memo,
    recentBlockhash: blockhash,
  });
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', treasury.key, message as Uint8Array<ArrayBuffer>));
  const sent = await rpc<string>('sendTransaction', [
    base64Encode(serializeTransaction(message, signature)),
    { encoding: 'base64', preflightCommitment: 'confirmed' },
  ]);
  try {
    await input.onBroadcast?.(sent);
    const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const statuses = await rpc<{ value: Array<{ err: unknown; confirmationStatus?: string } | null> }>('getSignatureStatuses', [[sent]]);
      const status = statuses.value[0];
      if (status?.err) throw new Error(`transfer ${sent} failed`);
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return sent;
      await new Promise((resolve) => setTimeout(resolve, CONFIRM_POLL_MS));
    }
    throw new Error(`transfer ${sent} was not confirmed in time`);
  } catch (error) {
    throw new TransferBroadcastError(sent, error instanceof Error ? error.message : String(error));
  }
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

/** The mint authority's address, read from the authority's own secret (bytes 32..64 are the public key). */
export function authorityAddress(): string {
  const raw = Deno.env.get('SOLANA_AUTHORITY_SECRET')?.trim();
  if (!raw) throw new TreasuryNotConfiguredError('SOLANA_AUTHORITY_SECRET is not set');
  let secret: Uint8Array | null;
  try {
    secret = raw.startsWith('[') ? Uint8Array.from(JSON.parse(raw)) : base58Decode(raw, 64);
  } catch {
    secret = null;
  }
  if (!secret || secret.length !== 64) throw new TreasuryNotConfiguredError('SOLANA_AUTHORITY_SECRET must be a 64-byte secret key');
  return base58Encode(secret.slice(32));
}

export async function treasuryAddress(): Promise<string> {
  return (await loadTreasury()).address;
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
