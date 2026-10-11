/**
 * The permanent copies of a credential on Arweave (`credential-archive` edge function), and the checks a
 * visitor's browser runs on them: fetch a copy from a public Arweave gateway, hash it, compare.
 */
import { sha256Hex } from '@/lib/chain/base58';
import { base58Decode } from '@/services/walletEncoding';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export interface ArchiveCopy {
  kind: 'metadata' | 'image' | 'evidence';
  /** The capability claim an evidence document belongs to. */
  claim: string | null;
  sha256: string;
  arweaveId: string;
  bytes: number;
  archivedAt: string | null;
  /** Where the copy can be read, the gateway that answers first in front. */
  urls: string[];
}

export interface CredentialArchive {
  asset: string;
  /** The Solana key that signed every copy: the mint authority, update authority of the collection. */
  signer: string;
  uploadsEnabled: boolean;
  metadata: ArchiveCopy | null;
  image: ArchiveCopy | null;
  evidence: ArchiveCopy[];
  findEndpoints: string[];
  findQuery: string;
  failedUploads: number;
}

function parseCopy(v: unknown): ArchiveCopy | null {
  const r = row(v);
  const kind = r.kind === 'metadata' || r.kind === 'image' || r.kind === 'evidence' ? r.kind : null;
  const sha256 = text(r.sha256);
  const arweaveId = text(r.arweave_id);
  const urls = Array.isArray(r.urls) ? r.urls.filter((u): u is string => typeof u === 'string' && u.startsWith('https://')) : [];
  if (!kind || !sha256 || !arweaveId || urls.length === 0) return null;
  return { kind, claim: text(r.claim), sha256, arweaveId, bytes: typeof r.bytes === 'number' ? r.bytes : 0, archivedAt: text(r.archived_at), urls };
}

export function parseArchive(body: unknown): CredentialArchive | null {
  const b = row(body);
  const asset = text(b.asset);
  const signer = text(b.signer);
  if (!asset || !signer) return null;
  const current = row(b.current);
  const find = row(b.find);
  return {
    asset,
    signer,
    uploadsEnabled: b.uploads_enabled === true,
    metadata: parseCopy(current.metadata),
    image: parseCopy(current.image),
    evidence: (Array.isArray(b.evidence) ? b.evidence : []).map(parseCopy).filter((copy): copy is ArchiveCopy => copy !== null),
    findEndpoints: Array.isArray(find.endpoints) ? find.endpoints.filter((u): u is string => typeof u === 'string') : [],
    findQuery: text(find.query) ?? '',
    failedUploads: typeof b.failed_uploads === 'number' ? b.failed_uploads : 0,
  };
}

/**
 * The copies of a credential, after asking the server to upload whatever is new. The server uploads a
 * given content once, whoever asks: opening a credential's page is what archives its latest version.
 * `null` for an asset Itera did not mint.
 */
export async function syncCredentialArchive(asset: string): Promise<CredentialArchive | null> {
  if (!url || !anonKey) throw new Error('Supabase not configured.');
  const res = await fetch(`${url}/functions/v1/credential-archive/${encodeURIComponent(asset)}`, { method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`credential-archive failed (${res.status})`);
  return parseArchive(await res.json());
}

/** The bytes of a copy from the first gateway that has it. */
export async function fetchCopy(copy: ArchiveCopy): Promise<{ bytes: Uint8Array; from: string }> {
  let last = 'no gateway';
  for (const gateway of copy.urls) {
    try {
      const res = await fetch(gateway);
      if (res.ok) return { bytes: new Uint8Array(await res.arrayBuffer()), from: new URL(gateway).host };
      last = `${new URL(gateway).host}: HTTP ${res.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : 'request failed';
    }
  }
  throw new Error(last);
}

export interface CopyCheck {
  copy: ArchiveCopy;
  /** The SHA-256 the browser computed over the bytes it downloaded. Null when no gateway answered. */
  computed: string | null;
  from: string | null;
  /** The downloaded bytes hash to what the archive lists. */
  intact: boolean;
  /** For an evidence document: the value of `claim:<id>` on the asset, as the browser read it from Solana. */
  onchain: string | null;
  /** For an evidence document: its hash starts with the value written on chain. */
  matchesChain: boolean | null;
}

/** Downloads one copy and checks it. `onchainClaims`: the `claim:<id>` attributes read from the asset account. */
export async function checkCopy(copy: ArchiveCopy, onchainClaims: ReadonlyMap<string, string>): Promise<CopyCheck> {
  const onchain = copy.kind === 'evidence' && copy.claim ? (onchainClaims.get(copy.claim) ?? null) : null;
  try {
    const { bytes, from } = await fetchCopy(copy);
    const computed = await sha256Hex(bytes);
    return { copy, computed, from, intact: computed === copy.sha256, onchain, matchesChain: copy.kind === 'evidence' ? onchain !== null && onchain.length >= 8 && computed.startsWith(onchain) : null };
  } catch {
    return { copy, computed: null, from: null, intact: false, onchain, matchesChain: copy.kind === 'evidence' ? false : null };
  }
}

/**
 * The address Arweave shows as the owner of a copy signed by a Solana key: base64url of the SHA-256
 * of the key's 32 bytes. Lets anyone tie a copy's owner to the collection's update authority.
 */
export async function arweaveOwnerOf(solanaAddress: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', base58Decode(solanaAddress) as BufferSource));
  return btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
