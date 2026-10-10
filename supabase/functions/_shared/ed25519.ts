import { SIGNATURE_BYTES, base58Bytes, base58Decode, base64Decode } from './solana-tx.ts';

const KEY_BYTES = 32;

/** Real ed25519 verification (WebCrypto). False for a wrong key, signature or message, and for malformed input. */
export async function verifyEd25519(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array): Promise<boolean> {
  if (publicKey.length !== KEY_BYTES || signature.length !== SIGNATURE_BYTES) return false;
  try {
    const key = await crypto.subtle.importKey('raw', publicKey as BufferSource, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, signature as BufferSource, message as BufferSource);
  } catch {
    return false;
  }
}

/**
 * The 64-byte readings of a signature given as base58 or base64. A short text can
 * be valid in both alphabets, so both are returned and the verification decides.
 */
export function signatureCandidates(text: unknown): Uint8Array[] {
  if (typeof text !== 'string' || text.length === 0 || text.length > SIGNATURE_BYTES * 2) return [];
  return [base58Bytes(text), base64Decode(text)].filter((bytes): bytes is Uint8Array => bytes?.length === SIGNATURE_BYTES);
}

/** True when `signatureText` is the ed25519 signature of `message` by the wallet at `address`. */
export async function verifyWalletSignature(address: string, signatureText: unknown, message: Uint8Array): Promise<boolean> {
  const publicKey = base58Decode(address, KEY_BYTES);
  if (!publicKey) return false;
  for (const signature of signatureCandidates(signatureText)) {
    if (await verifyEd25519(publicKey, signature, message)) return true;
  }
  return false;
}
