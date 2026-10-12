/**
 * The chest of a stamped day (`tera-chest`): the learner's chests, the chest of the day just finished, and the
 * public read a stranger uses to roll it again. Best effort everywhere: a missing, failing or switched-off
 * function answers "no chest", so the end of a day looks as it did before chests existed.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import type { Chest, ChestList, ChestRecompute, ChestStatus, ChestTera } from '@/types/tera';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const orNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const STATUSES: readonly ChestStatus[] = ['committed', 'rolling', 'minted', 'failed'];
export const NO_CHESTS: ChestList = { enabled: false, chests: [] };

function toChestTera(v: unknown): ChestTera | null {
  const r = row(v);
  const key = text(r.key);
  const imageUrl = text(r.image_url);
  if (!key || !imageUrl) return null;
  return { key, title: text(r.title) || key, tierName: text(r.tier_name), imageUrl, thumbUrl: text(r.thumb_url) || imageUrl, asset: orNull(r.asset), pageUrl: orNull(r.page_url), explorerUrl: orNull(r.explorer_url) };
}

/** Null for anything that is not a chest. A chest said to be minted with no Tera in it is not shown as minted. */
export function toChest(v: unknown): Chest | null {
  const r = row(v);
  const id = text(r.id);
  const status = STATUSES.find((s) => s === r.status);
  if (!id || !status) return null;
  const commit = row(r.commit);
  const seed = row(r.seed);
  const tera = toChestTera(r.tera);
  return {
    id,
    day: int(r.day) ?? 0,
    trail: text(r.trail),
    certification: text(r.certification),
    status: status === 'minted' && !tera ? 'rolling' : status,
    commit: int(commit.slot) != null ? { slot: commit.slot as number, tx: text(commit.tx) } : null,
    seed: int(seed.slot) != null && text(seed.blockhash) ? { slot: seed.slot as number, blockhash: text(seed.blockhash) } : null,
    tier: orNull(r.tier),
    odds: (Array.isArray(r.odds) ? r.odds : []).map(row).filter((o) => text(o.tier) && int(o.weight) != null).map((o) => ({ tier: text(o.tier), weight: o.weight as number })),
    tera,
    retryAfterMs: int(r.retry_after_ms),
  };
}

export function toChestList(v: unknown): ChestList {
  const r = row(v);
  if (r.enabled !== true) return NO_CHESTS;
  return { enabled: true, chests: (Array.isArray(r.chests) ? r.chests : []).map(toChest).filter((c): c is Chest => c !== null) };
}

export function toRecompute(v: unknown): ChestRecompute | null {
  const r = row(v);
  const formula = text(r.formula);
  if (!formula) return null;
  const inputs = Object.fromEntries(Object.entries(row(r.inputs)).filter((e): e is [string, string | number] => typeof e[1] === 'string' || typeof e[1] === 'number'));
  const list = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
  return { formula, inputs, pool: list(r.pool), steps: list(r.steps) };
}

/** The signed-in learner's chests, newest first. `enabled: false` on any failure. */
export async function getMyChests(): Promise<ChestList> {
  if (!isSupabaseConfigured) return NO_CHESTS;
  try {
    const { data, error } = await getSupabase().functions.invoke('tera-chest', { method: 'GET' });
    return error ? NO_CHESTS : toChestList(data);
  } catch {
    return NO_CHESTS;
  }
}

/** Settles or polls the chest of the day `lessonId` stamped. Idempotent on the backend. Null: no chest (yet, or ever). */
export async function settleChest(lessonId: string): Promise<Chest | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await getSupabase().functions.invoke('tera-chest', { body: { lesson_id: lessonId } });
    return error ? null : toChest(row(data).chest);
  } catch {
    return null;
  }
}

/** The public read of one chest. Throws when it cannot be read: the page that asked for it says so. */
export async function getChest(id: string): Promise<{ chest: Chest; recompute: ChestRecompute | null } | null> {
  if (!url || !anonKey) throw new Error('Supabase not configured.');
  const res = await fetch(`${url}/functions/v1/tera-chest/${encodeURIComponent(id)}`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`tera-chest failed (${res.status})`);
  const body = row(await res.json());
  const chest = toChest(body.chest);
  return chest ? { chest, recompute: toRecompute(body.recompute) } : null;
}

/** Where anyone rolls a chest again. */
export const chestVerifyPath = (id: string): string => `/verify?chest=${encodeURIComponent(id)}#chest`;
