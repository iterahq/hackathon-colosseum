/**
 * Permanent copies on Arweave. A file is wrapped in an ANS-104 data item signed
 * with an ed25519 key (the same curve as a Solana key, so the signer of a copy
 * can be compared with an address on chain) and handed to a bundler that
 * settles it on Arweave. No dependency: the format is small enough to write out.
 */
import { base64Encode } from './solana-tx.ts';

export const ARWEAVE_UPLOAD_URL = 'https://upload.ardrive.io/v1/tx/solana';
/** Where a copy can be read. The first answers at once; the second once the bundle settled on Arweave. */
export const ARWEAVE_GATEWAYS = ['https://turbo-gateway.com', 'https://arweave.net'] as const;
/** The bundler takes files up to this size without payment. */
export const FREE_UPLOAD_BYTES = 100 * 1024;
const SIGNATURE_TYPE_ED25519 = 2;
const UPLOAD_TIMEOUT_MS = 12_000;

export interface ArweaveTag {
  name: string;
  value: string;
}

const encoder = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function sha384(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-384', bytes as BufferSource));
}

type DeepHashItem = Uint8Array | DeepHashItem[];

/** Arweave's deep hash: a SHA-384 over a nested list that commits to every element and its length. */
export async function deepHash(item: DeepHashItem): Promise<Uint8Array> {
  if (item instanceof Uint8Array) {
    return sha384(concat(await sha384(concat(encoder.encode('blob'), encoder.encode(String(item.length)))), await sha384(item)));
  }
  let hash = await sha384(concat(encoder.encode('list'), encoder.encode(String(item.length))));
  for (const child of item) hash = await sha384(concat(hash, await deepHash(child)));
  return hash;
}

function zigzag(value: number): Uint8Array {
  let rest = (BigInt(value) << 1n) ^ (BigInt(value) >> 63n);
  const bytes: number[] = [];
  while (rest > 0x7fn) {
    bytes.push(Number(rest & 0x7fn) | 0x80);
    rest >>= 7n;
  }
  bytes.push(Number(rest));
  return Uint8Array.from(bytes);
}

/** The tags as ANS-104 stores them: one Avro array block of name/value byte strings. */
export function encodeTags(tags: readonly ArweaveTag[]): Uint8Array {
  if (tags.length === 0) return new Uint8Array();
  const parts: Uint8Array[] = [zigzag(tags.length)];
  for (const tag of tags) {
    const name = encoder.encode(tag.name);
    const value = encoder.encode(tag.value);
    parts.push(zigzag(name.length), name, zigzag(value.length), value);
  }
  return concat(...parts, Uint8Array.of(0));
}

function u64le(value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return bytes;
}

function base64Url(bytes: Uint8Array): string {
  return base64Encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface DataItem {
  /** The id the copy is read by: base64url of the SHA-256 of the signature. The same file, tags and key always give the same id. */
  id: string;
  bytes: Uint8Array;
}

/** A signed data item. `publicKey` is the 32-byte ed25519 key of `sign`. */
export async function buildDataItem(input: { publicKey: Uint8Array; sign: (message: Uint8Array) => Promise<Uint8Array>; tags: readonly ArweaveTag[]; data: Uint8Array }): Promise<DataItem> {
  if (input.publicKey.length !== 32) throw new Error('data item owner must be a 32-byte ed25519 key');
  const tags = encodeTags(input.tags);
  const empty = new Uint8Array();
  const message = await deepHash([encoder.encode('dataitem'), encoder.encode('1'), encoder.encode(String(SIGNATURE_TYPE_ED25519)), input.publicKey, empty, empty, tags, input.data]);
  const signature = await input.sign(message);
  if (signature.length !== 64) throw new Error('data item signature must be 64 bytes');
  const id = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', signature as BufferSource)));
  const bytes = concat(Uint8Array.of(SIGNATURE_TYPE_ED25519, 0), signature, input.publicKey, Uint8Array.of(0), Uint8Array.of(0), u64le(input.tags.length), u64le(tags.length), tags, input.data);
  return { id, bytes };
}

export class ArweaveUploadError extends Error {}

/** Hands a data item to the bundler. Resolves with its id once the bundler took it. */
export async function uploadDataItem(item: DataItem): Promise<string> {
  let response: Response;
  try {
    response = await fetch(ARWEAVE_UPLOAD_URL, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: item.bytes as BodyInit, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
  } catch (error) {
    throw new ArweaveUploadError(error instanceof Error ? error.message : 'upload failed');
  }
  if (!response.ok) throw new ArweaveUploadError(`bundler answered HTTP ${response.status}`);
  const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
  if (body?.id !== item.id) throw new ArweaveUploadError('bundler answered another id');
  return item.id;
}

export const arweaveUrls = (id: string): string[] => ARWEAVE_GATEWAYS.map((gateway) => `${gateway}/${id}`);
