/** Pure byte helpers for the sign-only wallet path: decoding, normalizing the wallet's answer, assembling the transaction. */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const SIGNATURE_BYTES = 64;

export function base58Decode(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    let carry = B58.indexOf(char);
    if (carry < 0) throw new Error(`Invalid base58 character "${char}".`);
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let zeros = 0;
  while (zeros < text.length && text[zeros] === '1') zeros += 1;
  return new Uint8Array([...new Array<number>(zeros).fill(0), ...bytes.reverse()]);
}

export function base64Decode(text: string): Uint8Array {
  const raw = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function base64Encode(bytes: Uint8Array): string {
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
}

const isBase58 = (text: string) => text.length > 0 && [...text].every((c) => B58.includes(c));

/** Plain letters and digits are valid in both alphabets: take the reading that looks like a signature or a transaction (first byte 1). */
function bytesOfString(text: string): Uint8Array | null {
  const readings: Uint8Array[] = [];
  for (const decode of isBase58(text) ? [base58Decode, base64Decode] : [base64Decode]) {
    try {
      readings.push(decode(text));
    } catch {
      /* not this alphabet */
    }
  }
  return readings.find((r) => r.length === SIGNATURE_BYTES) ?? readings.find((r) => r.length > SIGNATURE_BYTES && r[0] === 1) ?? readings[0] ?? null;
}

/** A wallet may hand bytes back as a string (base58 or base64), a typed array or `{ type: 'Buffer', data }`. */
export function bytesOf(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value) && value.every((n) => typeof n === 'number')) return Uint8Array.from(value);
  if (typeof value === 'string' && value) return bytesOfString(value);
  const data = (value as { data?: unknown } | null)?.data;
  return data !== undefined && data !== value ? bytesOf(data) : null;
}

export type SignOnlyAnswer = { kind: 'signature'; signature: Uint8Array } | { kind: 'transaction'; transaction: Uint8Array };

/**
 * Accepts what `signTransaction` may answer: a 64-byte signature (bare, or under `signature`), or a
 * whole signed transaction (bare, under `signedTransaction` / `transaction`, or an object with `serialize()`).
 */
export function normalizeSignOnlyAnswer(answer: unknown): SignOnlyAnswer | null {
  const holder = (answer ?? {}) as { signature?: unknown; signedTransaction?: unknown; transaction?: unknown; serialize?: () => unknown };
  const candidates = [answer, holder.signedTransaction, holder.transaction, holder.signature];
  for (const candidate of candidates) {
    const serialized = typeof (candidate as { serialize?: unknown } | null)?.serialize === 'function' ? (candidate as { serialize: () => unknown }).serialize() : candidate;
    const bytes = bytesOf(serialized);
    if (!bytes || bytes.length === 0) continue;
    if (bytes.length === SIGNATURE_BYTES) return { kind: 'signature', signature: bytes };
    if (bytes.length > SIGNATURE_BYTES) return { kind: 'transaction', transaction: bytes };
  }
  return null;
}

/** `[0x01][64-byte signature][message]`: a legacy transaction with exactly one signer. */
export function assembleSignedTransaction(signature: Uint8Array, message: Uint8Array): Uint8Array {
  if (signature.length !== SIGNATURE_BYTES) throw new Error(`Signature must be ${SIGNATURE_BYTES} bytes, got ${signature.length}.`);
  const out = new Uint8Array(1 + SIGNATURE_BYTES + message.length);
  out[0] = 1;
  out.set(signature, 1);
  out.set(message, 1 + SIGNATURE_BYTES);
  return out;
}
