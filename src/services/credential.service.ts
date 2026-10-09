/**
 * Public read of an on-chain credential through the `credential-verify` edge function. No session needed:
 * the anon key is the only credential sent. If the function's body changes, adapt it here only.
 */
import type { CredentialLookup, CredentialVerification } from '@/types/achievements';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export function parseCredential(body: unknown, asset: string): CredentialVerification {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const attrs = Array.isArray(b.attributes) ? (b.attributes as Record<string, unknown>[]) : [];
  const ach = b.achievement && typeof b.achievement === 'object' ? (b.achievement as Record<string, unknown>) : null;
  return {
    verified: b.verified === true,
    asset: text(b.asset) ?? asset,
    owner: text(b.owner),
    frozen: b.frozen === true,
    collection: text(b.collection),
    update_authority: text(b.update_authority),
    attributes: attrs.map((a) => ({ key: String(a.key ?? ''), value: String(a.value ?? '') })).filter((a) => a.key),
    achievement: ach
      ? {
          key: text(ach.key) ?? '',
          tier: text(ach.tier),
          title: (typeof ach.title === 'string' || (ach.title && typeof ach.title === 'object') ? ach.title : '') as string,
          image_url: text(ach.image_url),
          state: ach.state && typeof ach.state === 'object' ? (ach.state as Record<string, unknown>) : {},
          stamps: (Array.isArray(ach.stamps) ? (ach.stamps as Record<string, unknown>[]) : []).map((x) => ({ day: Number(x.day) })).filter((x) => x.day > 0),
        }
      : null,
    minted_at: text(b.minted_at),
  };
}

export async function verifyCredential(asset: string): Promise<CredentialLookup> {
  if (!url || !anonKey) throw new Error('Supabase not configured.');
  const started = Date.now();
  const res = await fetch(`${url}/functions/v1/credential-verify/${encodeURIComponent(asset)}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  const ms = Date.now() - started;
  if (res.status === 404) return { status: 'not_found', ms };
  if (!res.ok) throw new Error(`credential-verify failed (${res.status})`);
  const data = parseCredential(await res.json(), asset);
  return { status: data.verified ? 'verified' : 'unverified', data, ms };
}

/** The server-drawn artwork of a stored row, in the viewer's language. */
export const credentialImageUrl = (rowId: string, lang: string): string | null =>
  url && rowId ? `${url}/functions/v1/credential-meta/${encodeURIComponent(rowId)}/image.svg?lang=${lang}` : null;
