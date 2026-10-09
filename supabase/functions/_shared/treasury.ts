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

/** Sends lamports from the treasury and waits for confirmation. Returns the signature. */
export async function sendFromTreasury(input: { recipient: string; lamports: bigint; memo: string }): Promise<string> {
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
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const statuses = await rpc<{ value: Array<{ err: unknown; confirmationStatus?: string } | null> }>('getSignatureStatuses', [[sent]]);
    const status = statuses.value[0];
    if (status?.err) throw new Error(`transfer ${sent} failed`);
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return sent;
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_POLL_MS));
  }
  throw new Error(`transfer ${sent} was not confirmed in time`);
}
