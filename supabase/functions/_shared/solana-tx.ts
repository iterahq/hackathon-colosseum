const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export const SYSTEM_PROGRAM = '11111111111111111111111111111111';
export const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
export const SIGNATURE_BYTES = 64;
const KEY_BYTES = 32;
const MAX_U64 = (1n << 64n) - 1n;

export function base58Encode(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let encoded = '';
  while (value > 0n) {
    encoded = ALPHABET[Number(value % 58n)] + encoded;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = `1${encoded}`;
  }
  return encoded;
}

/** The bytes of a base58 text, `null` when it is not base58. */
export function base58Bytes(text: string): Uint8Array | null {
  if (typeof text !== 'string' || text.length === 0) return null;
  let value = 0n;
  for (const char of text) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) return null;
    value = value * 58n + BigInt(digit);
  }
  let leadingZeros = 0;
  while (text[leadingZeros] === '1') leadingZeros += 1;
  const significant: number[] = [];
  while (value > 0n) {
    significant.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  const bytes = new Uint8Array(leadingZeros + significant.length);
  bytes.set(significant, leadingZeros);
  return bytes;
}

/** `null` when the text is not base58 or does not decode to exactly `length` bytes. */
export function base58Decode(text: string, length: number): Uint8Array | null {
  if (typeof text !== 'string' || text.length > length * 2) return null;
  const bytes = base58Bytes(text);
  return bytes && bytes.length === length ? bytes : null;
}

export function isSignature(value: unknown): value is string {
  return typeof value === 'string' && base58Decode(value, SIGNATURE_BYTES) !== null;
}

export function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Standard or URL-safe base64, padded or not. `null` when the text is neither. */
export function base64Decode(text: string): Uint8Array | null {
  if (typeof text !== 'string' || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(text)) return null;
  const body = text.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (body.length % 4 === 1) return null;
  try {
    const binary = atob(body + '='.repeat((4 - (body.length % 4)) % 4));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Solana's compact-u16 length prefix. */
export function compactU16(value: number): number[] {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new Error('compact-u16 out of range');
  const bytes: number[] = [];
  let rest = value;
  while (rest >= 0x80) {
    bytes.push((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  bytes.push(rest);
  return bytes;
}

function key(address: string): Uint8Array {
  const bytes = base58Decode(address, KEY_BYTES);
  if (!bytes) throw new Error('not a Solana address');
  return bytes;
}

/** System Program `Transfer`: instruction index 2 (u32 LE) followed by the lamports (u64 LE). */
export function transferData(lamports: bigint): Uint8Array {
  if (lamports <= 0n || lamports > MAX_U64) throw new Error('lamports out of range');
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true);
  view.setBigUint64(4, lamports, true);
  return data;
}

export interface TransferMessageInput {
  /** Fee payer and source of the lamports: the only signer. */
  payer: string;
  recipient: string;
  lamports: bigint;
  memo: string;
  recentBlockhash: string;
}

/**
 * A legacy (unversioned) transaction message: one System transfer and one Memo.
 * Accounts: payer (signer, writable), recipient (writable), System, Memo.
 */
export function buildTransferMessage(input: TransferMessageInput): Uint8Array {
  if (input.payer === input.recipient) throw new Error('payer and recipient must differ');
  const memo = new TextEncoder().encode(input.memo);
  if (memo.length === 0 || memo.length > 256) throw new Error('memo must be 1..256 bytes');
  const transfer = transferData(input.lamports);
  return Uint8Array.from([
    1, 0, 2,
    ...compactU16(4),
    ...key(input.payer),
    ...key(input.recipient),
    ...key(SYSTEM_PROGRAM),
    ...key(MEMO_PROGRAM),
    ...key(input.recentBlockhash),
    ...compactU16(2),
    2, ...compactU16(2), 0, 1, ...compactU16(transfer.length), ...transfer,
    3, ...compactU16(0), ...compactU16(memo.length), ...memo,
  ]);
}

/** The wire transaction for a single-signer message. Without a signature the slot is zeroed. */
export function serializeTransaction(message: Uint8Array, signature?: Uint8Array): Uint8Array {
  if (signature && signature.length !== SIGNATURE_BYTES) throw new Error('signature must be 64 bytes');
  return Uint8Array.from([...compactU16(1), ...(signature ?? new Uint8Array(SIGNATURE_BYTES)), ...message]);
}
