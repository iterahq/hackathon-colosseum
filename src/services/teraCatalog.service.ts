/** The Tera tiers and the tier of every Tera, from the catalog (`credential-meta/tiers`). Public, anon key only. The bundled copy answers when the network does not. */
import FALLBACK from '@/content/teraTiers.json';
import type { TeraCatalog, TeraTier } from '@/types/tera';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const both = (v: unknown): { pt: string; en: string } => {
  const r = row(v);
  const pt = text(r.pt) || text(r.en);
  return { pt, en: text(r.en) || pt };
};

function toTier(v: unknown): TeraTier | null {
  const r = row(v);
  const rarity = text(r.rarity);
  const name = both(r.tier_name);
  if (!rarity || !name.en) return null;
  return { rarity, rank: typeof r.rank === 'number' ? r.rank : 0, tierName: name, label: both(r.label), earnOnly: r.earn_only === true };
}

/** Null when the body is not a catalog (no tier, or no Tera listed): the caller keeps the bundled copy. */
export function toTeraCatalog(body: unknown, source: TeraCatalog['source']): TeraCatalog | null {
  const b = row(body);
  const tiers = (Array.isArray(b.tiers) ? b.tiers : []).map(toTier).filter((tier): tier is TeraTier => tier !== null);
  const avatars = Object.fromEntries(Object.entries(row(b.avatars)).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''));
  if (tiers.length === 0 || Object.keys(avatars).length === 0) return null;
  return { source, tiers: [...tiers].sort((a, b2) => a.rank - b2.rank), avatars };
}

export const FALLBACK_CATALOG: TeraCatalog = toTeraCatalog(FALLBACK, 'bundled') as TeraCatalog;

/** The live catalog, or the bundled copy when the function is missing, fails or answers something else. Never throws. */
export async function getTeraCatalog(): Promise<TeraCatalog> {
  if (!url || !anonKey) return FALLBACK_CATALOG;
  try {
    const res = await fetch(`${url}/functions/v1/credential-meta/tiers`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
    if (!res.ok) return FALLBACK_CATALOG;
    return toTeraCatalog(await res.json(), 'live') ?? FALLBACK_CATALOG;
  } catch {
    return FALLBACK_CATALOG;
  }
}
