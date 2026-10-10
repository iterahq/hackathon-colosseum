import type { CompanionAvatarArt } from './art.ts';
import { DEFAULT_AVATAR_KEY, allowsOutfit, avatarImageUrl, type AvatarCatalog } from './avatars.ts';

/** Raw bytes a picture may have to be inlined: base64 adds a third, and the whole card stays under ~250 KB. */
const MAX_BYTES = { '512': 110_000, '128': 60_000 } as const;
const FETCH_TIMEOUT_MS = 2_500;
const KEEP_MS = 10 * 60_000;
const RETRY_MISSING_MS = 30_000;
const MAX_ENTRIES = 80;

const cache = new Map<string, { at: number; data: string | null }>();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

/** One published picture as a data URI, kept in memory by URL. `null` when it is missing, too large or not an image. */
async function fetchDataUri(url: string, maxBytes: number): Promise<string | null> {
  const known = cache.get(url);
  if (known && Date.now() - known.at < (known.data ? KEEP_MS : RETRY_MISSING_MS)) return known.data;
  let data: string | null = null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'error' });
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim();
    if (response.ok && (type === 'image/webp' || type === 'image/png')) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 0 && bytes.length <= maxBytes) data = `data:${type};base64,${toBase64(bytes)}`;
    } else {
      await response.body?.cancel();
    }
  } catch (error) {
    console.error('avatar image fetch failed', url, error instanceof Error ? error.message : error);
  }
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(url, { at: Date.now(), data });
  return data;
}

/**
 * What the companion card draws for an avatar key. The default avatar is the
 * built-in Tera (no fetch, the card every learner had before avatars). Any
 * other one is its published picture, the 512 px file when it is small enough
 * to inline and the 128 px thumb otherwise; when neither can be had the card
 * falls back to the built-in Tera. The URL is built from a catalog key only.
 */
export async function companionAvatarArt(catalog: AvatarCatalog, key: string | null | undefined, supabaseUrl: string): Promise<CompanionAvatarArt | null> {
  const item = key ? catalog.items.get(key) : undefined;
  if (!item || item.key === DEFAULT_AVATAR_KEY) return null;
  const image =
    (await fetchDataUri(avatarImageUrl(supabaseUrl, item, '512'), MAX_BYTES['512'])) ??
    (await fetchDataUri(avatarImageUrl(supabaseUrl, item, '128'), MAX_BYTES['128']));
  return { key: item.key, image, allowsOutfit: allowsOutfit(item.avatar_group) };
}
