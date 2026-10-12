/**
 * Public read of an on-chain credential through the `credential-verify` edge function. No session needed:
 * the anon key is the only credential sent. If the function's body changes, adapt it here only.
 */
import { toPublicEndorsements } from '@/services/endorsement.service';
import type { CredentialLookup, CredentialVerification } from '@/types/achievements';
import { parseChainRead } from '@/types/chainRead';
import { takePreload } from '@/services/learnerProfile.service';
import { toTeraOrigin } from '@/services/teraOrigin';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function parseTera(b: Record<string, unknown>): CredentialVerification['tera'] {
  const a = b.avatar && typeof b.avatar === 'object' ? (b.avatar as Record<string, unknown>) : null;
  if (!a || !text(a.key)) return null;
  const lore = a.lore && typeof a.lore === 'object' ? (a.lore as Record<string, unknown>) : {};
  const origin = toTeraOrigin({ ...a, asset: b.asset });
  return {
    key: String(a.key),
    // A sponsor Tera is known by its brand, not by the base Tera it was drawn on.
    name: origin?.sponsor?.brand ?? text(lore.name) ?? text(b.name) ?? String(a.key),
    rarity: text(a.rarity) ?? '',
    tierName: text(a.tier_name) ?? '',
    serial: typeof a.serial === 'number' ? a.serial : null,
    imageUrl: text(b.image_url),
    origin,
  };
}

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
          trail: text(ach.trail),
          image_url: text(ach.image_url),
          state: ach.state && typeof ach.state === 'object' ? (ach.state as Record<string, unknown>) : {},
          stamps: (Array.isArray(ach.stamps) ? (ach.stamps as Record<string, unknown>[]) : []).map((x) => ({ day: Number(x.day) })).filter((x) => x.day > 0),
        }
      : null,
    minted_at: text(b.minted_at),
    endorsements: toPublicEndorsements(b.endorsements),
    snapshot: b.snapshot && typeof b.snapshot === 'object' ? { source: text((b.snapshot as Record<string, unknown>).source) ?? 'chain', mirrored_at: text((b.snapshot as Record<string, unknown>).mirrored_at) } : null,
    companion: b.companion && typeof b.companion === 'object' ? (b.companion as Record<string, unknown>) : null,
    tera: parseTera(b),
  };
}

/** `fresh` asks the function to read the chain now instead of serving its cached answer. */
export async function verifyCredential(asset: string, lang = 'pt', { fresh = false }: { fresh?: boolean } = {}): Promise<CredentialLookup> {
  if (!url || !anonKey) throw new Error('Supabase not configured.');
  const started = Date.now();
  const live = () =>
    fetch(`${url}/functions/v1/credential-verify/${encodeURIComponent(asset)}?lang=${lang}${fresh ? '&fresh=1' : ''}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
  const res = await ((fresh ? null : takePreload('__iteraCredential', asset, lang)) ?? live()).catch(live);
  const ms = Date.now() - started;
  if (res.status === 404 || res.status === 400) return { status: 'not_found', ms };
  if (!res.ok) throw new Error(`credential-verify failed (${res.status})`);
  const body: unknown = await res.json();
  const data = parseCredential(body, asset);
  const read = parseChainRead((body as { read?: unknown })?.read, ms);
  return { status: data.verified ? 'verified' : 'unverified', data, ms: read.ms, read };
}

const ART_BUMP_KEY = 'itera.credentialArtBump';

/** Bumped when a purchase changes the art (ink, frame): the art is cached per URL for 60 s. */
let artBump: string = (() => {
  try {
    return globalThis.sessionStorage?.getItem(ART_BUMP_KEY) ?? '';
  } catch {
    return '';
  }
})();

export function bumpCredentialArt(now: number = Date.now()): void {
  artBump = String(now);
  try {
    globalThis.sessionStorage?.setItem(ART_BUMP_KEY, artBump);
  } catch {
    /* storage unavailable: the in-memory value still applies */
  }
}

/** The server-drawn artwork of a stored row, in the viewer's language; `version` is data that changes with the art (days stamped, tier). */
export function credentialImageUrl(rowId: string, lang: string, version?: string | number | null): string | null {
  if (!url || !rowId) return null;
  const v = [version, artBump].filter((part) => part !== undefined && part !== null && part !== '').join('-');
  return `${url}/functions/v1/credential-meta/${encodeURIComponent(rowId)}/image.svg?lang=${lang}${v ? `&v=${encodeURIComponent(v)}` : ''}`;
}
