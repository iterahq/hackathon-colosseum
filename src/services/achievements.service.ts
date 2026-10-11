/**
 * Read-only access to the achievement catalog (`itera.achievements`) and the learner's own
 * rows (`itera.user_achievements`). Minting writes those rows elsewhere; this module never does.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { getIteraUserId } from '@/services/iteraUser';
import type { Achievement, AchievementKind, MintStatus, UserAchievement } from '@/types/achievements';

type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const orNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const bag = (v: unknown): Record<string, string> => (v && typeof v === 'object' ? (v as Record<string, string>) : {});

const KINDS: readonly AchievementKind[] = ['day', 'trail', 'streak', 'milestone'];
const MINT_STATUSES: readonly MintStatus[] = ['unclaimed', 'pending', 'minted', 'failed'];

export async function getAchievementCatalog(): Promise<Achievement[]> {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured — live Itera data unavailable.');
  const { data, error } = await getSupabase()
    .from('achievements')
    .select('key, kind, tier, title_i18n, description_i18n, art, sort')
    .order('sort', { ascending: true });
  if (error) throw new Error(error.message);
  return asRows(data).map((r) => ({
    key: str(r.key),
    kind: KINDS.find((k) => k === r.kind) ?? 'milestone',
    tier: orNull(r.tier),
    title: bag(r.title_i18n),
    description: bag(r.description_i18n),
    art: r.art && typeof r.art === 'object' ? (r.art as Record<string, unknown>) : {},
    sort: typeof r.sort === 'number' ? r.sort : 0,
  }));
}

export async function getMyAchievements(): Promise<UserAchievement[]> {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured — live Itera data unavailable.');
  const userId = await getIteraUserId();
  if (!userId) return [];
  const { data, error } = await getSupabase()
    .from('user_achievements')
    .select('id, achievement_key, ref_id, earned_at, mint_status, asset_address, tx_signature')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return asRows(data).map((r) => ({
    id: str(r.id),
    achievementKey: str(r.achievement_key),
    refId: orNull(r.ref_id),
    earnedAt: orNull(r.earned_at),
    mintStatus: MINT_STATUSES.find((s) => s === r.mint_status) ?? 'unclaimed',
    assetAddress: orNull(r.asset_address),
    txSignature: orNull(r.tx_signature),
  }));
}

/**
 * The signature of the stamp transaction the server has SENT for this learner and not yet confirmed: the server
 * writes it on the rows being stamped the moment the node takes it. `null`: nothing sent in the last minutes.
 */
export async function getSentStampSignature(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const userId = await getIteraUserId();
  if (!userId) return null;
  const { data, error } = await getSupabase()
    .from('user_achievements')
    .select('tx_signature, mint_status, earned_at')
    .eq('user_id', userId)
    .neq('mint_status', 'minted')
    .not('tx_signature', 'is', null)
    .gte('earned_at', new Date(Date.now() - 10 * 60_000).toISOString())
    .order('earned_at', { ascending: false })
    .limit(1);
  if (error) return null;
  return orNull(asRows(data)[0]?.tx_signature);
}
