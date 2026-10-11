/** Pure model of the stamp ceremony: what a `passport` response means for the lesson just finished. */
import type { AchievementKind, CeremonyStatus, PassportAward, PassportResult } from '@/types/achievements';
import type { I18nText } from '@/types/content';
import { trailName } from '@/utils/trailDashboard';

export interface CeremonyMedal {
  key: string;
  title: string;
  glyph: string;
  kind: AchievementKind;
  /** `user_achievements.id`, which keys the backend artwork. */
  credentialId: string | null;
}

export interface CeremonyModel {
  day: number;
  /** Stamps on the page once this one landed, as the server counts them. */
  daysDone: number;
  totalDays: number;
  trailTitle: string;
  status: CeremonyStatus;
  /** The server turned the certification gold. Never inferred from the day's position alone. */
  last: boolean;
  newMedals: CeremonyMedal[];
  txSignature: string | null;
  assetAddress: string | null;
}

const MEDAL_KINDS = new Set(['streak', 'milestone']);

const text = (v: string | I18nText | undefined | null, lang: string): string => {
  if (!v) return '';
  if (typeof v === 'string') return v;
  return v[lang] ?? v.pt ?? v.en ?? Object.values(v)[0] ?? '';
};

/** The trail as the page header prints it: "Semana 1 · HTML" -> "HTML", the same name the dashboard uses. */
const shortTitle = (v: unknown, lang: string): string => {
  if (!v) return '';
  return text(trailName(typeof v === 'string' ? { [lang]: v } : (v as I18nText)), lang);
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Several `passport` calls (it mints at most 3 transactions each) read as one: the latest copy of each row wins. */
export function mergeResults(results: readonly PassportResult[]): PassportResult {
  const byId = new Map<string, { row: PassportAward; fresh: boolean }>();
  for (const r of results) {
    for (const row of r.awards ?? []) byId.set(row.id, { row, fresh: byId.get(row.id)?.fresh ?? true });
    for (const row of r.updated ?? []) byId.set(row.id, { row, fresh: byId.get(row.id)?.fresh ?? false });
  }
  const last = results[results.length - 1];
  const all = [...byId.values()];
  return {
    awards: all.filter((x) => x.fresh).map((x) => x.row),
    updated: all.filter((x) => !x.fresh).map((x) => x.row),
    remaining: last?.remaining ?? 0,
    mint: last?.mint,
    day_incomplete: last?.day_incomplete,
    day_pending_review: last?.day_pending_review,
  };
}

function statusOf(pass: PassportAward | undefined, result: PassportResult): CeremonyStatus {
  if (pass?.mint_status === 'minted') return 'minted';
  const blocked = result.mint?.blocked;
  if (blocked === 'no_wallet') return 'no_wallet';
  if (blocked) return 'pending';
  if (pass?.mint_status === 'failed') return 'failed';
  return result.remaining > 0 || result.mint?.attempted ? 'failed' : 'pending';
}

/**
 * The ceremony of `lessonId`, or null when this call stamped nothing for it (a revisit).
 * N/total come from the trail passport row: a `day_stamp` has no asset of its own.
 */
export function ceremonyFromResult(result: PassportResult, lessonId: string, lang: string): CeremonyModel | null {
  const rows = [...(result.awards ?? []), ...(result.updated ?? [])];
  const stamp = rows.find((r) => r.key === 'day_stamp' && (r.ref_id === lessonId || (Array.isArray(r.state.stamped_lesson_ids) && r.state.stamped_lesson_ids.includes(lessonId))));
  if (!stamp) return null;
  const parent = String(stamp.state.parent_id ?? '');
  const pass = rows.find((r) => r.id === parent) ?? rows.find((r) => r.key === 'trail_pass' && r.ref_id === stamp.state.trail_id);
  const source = pass ?? stamp;
  const totalDays = num(source.state.total_days) || num(stamp.state.total_days);
  const day = num(stamp.state.day) || num(source.state.days_done);
  const daysDone = num(source.state.days_done) || day;
  return {
    day,
    daysDone,
    totalDays,
    trailTitle: shortTitle(source.state.trail_title, lang) || String(source.state.trail ?? ''),
    status: statusOf(pass, result),
    last: totalDays > 0 && (daysDone >= totalDays || source.state.tier === 'gold' || pass?.tier === 'gold'),
    newMedals: (result.awards ?? [])
      .filter((r) => MEDAL_KINDS.has(r.kind))
      .map((r) => ({ key: r.key, kind: r.kind, credentialId: r.id || null, title: text(r.title, lang), glyph: text(r.title, lang).slice(0, 3).toUpperCase() })),
    txSignature: pass?.tx_signature ?? null,
    assetAddress: pass?.asset_address ?? null,
  };
}

/** True when the call is worth repeating: transactions are still due and nothing blocks them. */
export const shouldContinue = (r: PassportResult): boolean => r.remaining > 0 && !r.mint?.blocked;
