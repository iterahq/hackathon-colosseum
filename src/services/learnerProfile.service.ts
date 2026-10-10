/** Public read of a wallet's Itera credentials through the `learner-profile` edge function. Anon key only. */
import type { LearnerProfile, ProfileLookup } from '@/types/learnerProfile';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(row) : []);
const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function parseProfile(body: unknown, wallet: string, lang: 'pt' | 'en'): LearnerProfile {
  const b = row(body);
  const c = b.companion && typeof b.companion === 'object' ? row(b.companion) : null;
  return {
    wallet: text(b.wallet) ?? wallet,
    verifiedCount: int(b.verified_count) ?? 0,
    companion:
      c && text(c.asset)
        ? {
            asset: String(c.asset),
            verified: c.verified === true,
            lives: int(c.lives),
            maxLives: int(c.max_lives) ?? 5,
            outfit: text(c.outfit) && c.outfit !== 'none' ? String(c.outfit) : null,
            level: int(c.level),
            xp: int(c.xp),
            streak: int(c.streak),
            imageUrl: text(c.image_url),
            explorerUrl: text(c.explorer_url),
          }
        : null,
    certifications: rows(b.certifications)
      .filter((r) => text(r.asset))
      .map((r) => {
        const title = row(r.trail_title);
        return {
          asset: String(r.asset),
          verified: r.verified === true,
          trail: text(title[lang]) ?? text(r.trail) ?? '',
          daysDone: int(r.days_done) ?? 0,
          totalDays: int(r.total_days) ?? 0,
          tier: text(r.tier),
          ink: text(r.ink),
          frame: text(r.frame),
          completedAt: text(r.completed_at),
          earnedAt: text(r.earned_at),
          imageUrl: text(r.image_url),
          pageUrl: text(r.page_url),
          explorerUrl: text(r.explorer_url),
        };
      }),
    medals: rows(b.medals)
      .filter((r) => text(r.asset))
      .map((r) => ({
        asset: String(r.asset),
        verified: r.verified === true,
        key: text(r.key) ?? '',
        title: text(r.title) ?? text(r.key) ?? '',
        tier: text(r.tier),
        earnedAt: text(r.earned_at),
        imageUrl: text(r.image_url),
        explorerUrl: text(r.explorer_url),
      })),
  };
}

export async function getLearnerProfile(wallet: string, lang: 'pt' | 'en'): Promise<ProfileLookup> {
  if (!url || !anonKey) throw new Error('Supabase not configured.');
  const res = await fetch(`${url}/functions/v1/learner-profile/${encodeURIComponent(wallet)}?lang=${lang}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  if (res.status === 400 || res.status === 404) return { status: 'invalid' };
  if (!res.ok) throw new Error(`learner-profile failed (${res.status})`);
  return { status: 'ok', profile: parseProfile(await res.json(), wallet, lang) };
}
