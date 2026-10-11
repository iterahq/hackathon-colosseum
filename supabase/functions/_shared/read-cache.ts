/**
 * A cache of the public chain-read answers, in the database (`itera.read_cache`, migration 0270), because
 * an edge function may run every request in a fresh isolate. A row is served only while its `version`
 * (what the database knows about the wallet's on-chain writes, `itera.chain_version`) still matches, and
 * never past `HARD_MS`. Past `SOFT_MS` the row is served and refreshed behind the answer. `?fresh=1`
 * always reads the chain. Every answer says where it came from and when it was read.
 */
import type { IteraClient } from './db.ts';

export const SOFT_MS = 30_000;
export const HARD_MS = 30 * 60_000;

export interface ReadMeta {
  source: 'chain' | 'cache';
  /** When the body was read from the chain. */
  at: string;
  age_ms: number;
  /** How long that read took. */
  ms: number;
}

export interface CacheRow {
  version: string;
  body: unknown;
  read_at: string;
  read_ms: number;
}

export type CacheVerdict = 'serve' | 'serve_and_refresh' | 'live';

export function cacheVerdict(row: CacheRow | null, version: string, now: number, fresh: boolean): CacheVerdict {
  if (fresh || !row || row.version !== version) return 'live';
  const age = now - Date.parse(row.read_at);
  if (!Number.isFinite(age) || age < 0 || age > HARD_MS) return 'live';
  return age > SOFT_MS ? 'serve_and_refresh' : 'serve';
}

export function wantsFresh(request: Request): boolean {
  return new URL(request.url).searchParams.get('fresh') === '1';
}

function inBackground(work: Promise<unknown>): void {
  const guarded = work.catch((error) => console.error('read cache background work failed', error instanceof Error ? error.message : error));
  (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(guarded);
}

/** The database's view of a wallet's on-chain writes. An unreadable version never serves a cached row. */
export async function chainVersion(db: IteraClient, wallet: string): Promise<string> {
  try {
    const { data, error } = await db.rpc('chain_version', { p_wallet: wallet });
    if (error) throw new Error(error.message);
    return typeof data === 'string' && data ? data : `unknown:${Date.now()}`;
  } catch (error) {
    console.error('chain_version unavailable', error instanceof Error ? error.message : error);
    return `unknown:${Date.now()}`;
  }
}

export async function assetVersion(db: IteraClient, asset: string): Promise<string> {
  try {
    const { data, error } = await db.rpc('chain_version_of_asset', { p_asset: asset });
    if (error) throw new Error(error.message);
    return typeof data === 'string' && data ? data : `unknown:${Date.now()}`;
  } catch (error) {
    console.error('chain_version_of_asset unavailable', error instanceof Error ? error.message : error);
    return `unknown:${Date.now()}`;
  }
}

export async function loadCacheRow(db: IteraClient, key: string): Promise<CacheRow | null> {
  try {
    const { data, error } = await db.from('read_cache').select('version,body,read_at,read_ms').eq('key', key).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as CacheRow | null) ?? null;
  } catch (error) {
    console.error('read_cache unavailable', error instanceof Error ? error.message : error);
    return null;
  }
}

async function storeCacheRow(db: IteraClient, key: string, version: string, body: unknown, readMs: number): Promise<void> {
  const { error } = await db.rpc('read_cache_put', { p_key: key, p_version: version, p_body: body, p_read_ms: readMs });
  if (error) throw new Error(error.message);
}

/**
 * Serves `key` from the cache when its version still matches, else reads live through `compute`.
 * A `null` body is never stored (an asset that is not there). Throws whatever `compute` throws.
 */
export async function cachedRead<T>(
  db: IteraClient,
  input: { key: string; version: string; fresh: boolean; row?: CacheRow | null },
  compute: () => Promise<T | null>,
): Promise<{ body: T | null; read: ReadMeta }> {
  const row = input.row === undefined ? await loadCacheRow(db, input.key) : input.row;
  const now = Date.now();
  const verdict = cacheVerdict(row, input.version, now, input.fresh);
  const live = async () => {
    const started = Date.now();
    const body = await compute();
    const ms = Date.now() - started;
    if (body !== null) inBackground(storeCacheRow(db, input.key, input.version, body, ms));
    return { body, read: { source: 'chain' as const, at: new Date(started).toISOString(), age_ms: 0, ms } };
  };
  if (verdict === 'live' || !row) return live();
  if (verdict === 'serve_and_refresh') inBackground(live());
  return { body: row.body as T, read: { source: 'cache', at: row.read_at, age_ms: Math.max(0, now - Date.parse(row.read_at)), ms: row.read_ms } };
}
