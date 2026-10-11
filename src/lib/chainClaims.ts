import { base58Decode, base64Decode } from '@/services/walletEncoding';

export const CORE_PROGRAM = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';
export const DEFAULT_RPC_URL = 'https://api.devnet.solana.com';

const rpcUrl = (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) || DEFAULT_RPC_URL;
const HEX = /^[0-9a-f]{1,64}$/;
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder('utf-8', { fatal: true });

export interface RawAccount {
  owner: string;
  data: Uint8Array;
}

export type AssetRead =
  | { status: 'ok'; claims: Record<string, string> }
  | { status: 'missing' | 'wrong-program' | 'wrong-owner' };

export type ClaimCheck = 'verified' | 'not-found' | 'mismatch' | 'asset-missing' | 'wrong-program' | 'wrong-owner';

function u32(data: Uint8Array, at: number): number | null {
  if (at < 0 || at + 4 > data.length) return null;
  return (data[at] | (data[at + 1] << 8) | (data[at + 2] << 16) | (data[at + 3] << 24)) >>> 0;
}

function matches(data: Uint8Array, at: number, needle: Uint8Array): boolean {
  if (at + needle.length > data.length) return false;
  for (let i = 0; i < needle.length; i += 1) if (data[at + i] !== needle[i]) return false;
  return true;
}

/** Finds the borsh string `key` (u32 LE length + utf8) followed by a borsh string value, anywhere in the account bytes. */
export function findAttribute(data: Uint8Array, key: string): string | null {
  const name = ENCODER.encode(key);
  for (let at = 0; at + 4 + name.length + 4 <= data.length; at += 1) {
    if (u32(data, at) !== name.length || !matches(data, at + 4, name)) continue;
    const valueAt = at + 4 + name.length;
    const length = u32(data, valueAt);
    if (length === null || length === 0 || length > 64 || valueAt + 4 + length > data.length) continue;
    try {
      const value = DECODER.decode(data.subarray(valueAt + 4, valueAt + 4 + length));
      if (HEX.test(value)) return value;
    } catch {
      continue;
    }
  }
  return null;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Reads one Metaplex Core asset: program, owner at bytes 1..33, and every requested claim attribute. */
export function parseCoreAsset(account: RawAccount | null, wallet: string, attributes: string[]): AssetRead {
  if (!account) return { status: 'missing' };
  if (account.owner !== CORE_PROGRAM) return { status: 'wrong-program' };
  let walletBytes: Uint8Array;
  try {
    walletBytes = base58Decode(wallet);
  } catch {
    return { status: 'wrong-owner' };
  }
  if (account.data.length < 33 || !sameBytes(account.data.subarray(1, 33), walletBytes)) return { status: 'wrong-owner' };
  const claims: Record<string, string> = {};
  for (const attribute of attributes) {
    const value = findAttribute(account.data, attribute);
    if (value) claims[attribute] = value;
  }
  return { status: 'ok', claims };
}

/** The strong check: the chain holds the attribute and its value is a prefix of the evidence hash. */
export function checkClaim(read: AssetRead | undefined, attribute: string, evidenceHash: string): ClaimCheck {
  if (!read || read.status === 'missing') return 'asset-missing';
  if (read.status !== 'ok') return read.status;
  const value = read.claims[attribute];
  if (!value) return 'not-found';
  return evidenceHash.toLowerCase().startsWith(value) ? 'verified' : 'mismatch';
}

export async function fetchAccount(asset: string, signal?: AbortSignal): Promise<RawAccount | null> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [asset, { encoding: 'base64', commitment: 'confirmed' }] }),
  });
  if (!res.ok) throw new Error(`rpc failed (${res.status})`);
  const body = (await res.json()) as { error?: unknown; result?: { value?: { owner?: string; data?: [string, string] } | null } };
  if (body.error) throw new Error('rpc error');
  const value = body.result?.value;
  if (!value) return null;
  if (!value.owner || !Array.isArray(value.data) || value.data[1] !== 'base64') throw new Error('rpc malformed');
  return { owner: value.owner, data: base64Decode(value.data[0]) };
}

export interface ChainTarget {
  asset: string;
  attributes: string[];
}

export async function readChainAssets(wallet: string, targets: ChainTarget[], signal?: AbortSignal): Promise<Record<string, AssetRead>> {
  const entries = await Promise.all(
    targets.map(async (t) => [t.asset, parseCoreAsset(await fetchAccount(t.asset, signal), wallet, t.attributes)] as const)
  );
  return Object.fromEntries(entries);
}

export async function sha256Hex(textValue: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', ENCODER.encode(textValue));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface EvidenceFacts {
  completedAt: string | null;
  activityCount: number;
}

export function evidenceFacts(evidence: string): EvidenceFacts | null {
  try {
    const parsed = JSON.parse(evidence) as { completed_at?: unknown; activities?: unknown };
    return {
      completedAt: typeof parsed.completed_at === 'string' ? parsed.completed_at : null,
      activityCount: Array.isArray(parsed.activities) ? parsed.activities.length : 0,
    };
  } catch {
    return null;
  }
}
