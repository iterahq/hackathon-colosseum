import { balanceOf } from './rpc.ts';
import { base58Encode, base64Decode } from './solana-tx.ts';
import { PKCS8_ED25519_PREFIX, sendTransfer, signerFromSeed, treasurySeed, type TransferSigner } from './treasury.ts';

const DOMAIN = 'itera-bounty-escrow:v1:';

/**
 * The 32-byte seed of a bounty's escrow key: HMAC-SHA256 of the bounty id under
 * the root seed. One key per bounty, recomputed whenever it is needed and never stored.
 */
export async function escrowSeed(rootSeed: Uint8Array, bountyId: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', rootSeed as Uint8Array<ArrayBuffer>, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${DOMAIN}${bountyId}`)));
}

/** The address (public key) of an ed25519 seed. */
export async function addressOfSeed(seed: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from([...PKCS8_ED25519_PREFIX, ...seed]), { name: 'Ed25519' }, true, ['sign']);
  const jwk = await crypto.subtle.exportKey('jwk', key);
  const bytes = base64Decode(jwk.x ?? '');
  if (!bytes || bytes.length !== 32) throw new Error('escrow: could not read the public key');
  return base58Encode(bytes);
}

async function escrowSigner(bountyId: string): Promise<TransferSigner> {
  const seed = await escrowSeed(treasurySeed(), bountyId);
  return signerFromSeed(seed, await addressOfSeed(seed));
}

export async function escrowAddress(bountyId: string): Promise<string> {
  return addressOfSeed(await escrowSeed(treasurySeed(), bountyId));
}

export function escrowBalance(address: string): Promise<bigint> {
  return balanceOf(address);
}

/**
 * Sends `lamports` out of a bounty's escrow account, which also pays the fee.
 * `expectedAddress` is the address recorded when the bounty was created: a
 * root key that changed since then is refused instead of signing for another account.
 */
export async function sendFromEscrow(input: {
  bountyId: string;
  expectedAddress: string;
  recipient: string;
  lamports: bigint;
  memo: string;
  onBroadcast?: (signature: string) => Promise<void>;
}): Promise<string> {
  const signer = await escrowSigner(input.bountyId);
  if (signer.address !== input.expectedAddress) throw new Error('escrow: derived key does not match the recorded escrow address');
  return sendTransfer(signer, { recipient: input.recipient, lamports: input.lamports, memo: input.memo, onBroadcast: input.onBroadcast });
}
