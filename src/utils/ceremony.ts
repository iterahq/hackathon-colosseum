/** Pure model of the stamp ceremony: what a `passport` response means for the lesson just finished. */
import type { CeremonyStatus, PassportAward, PassportResult } from '@/types/achievements';
import type { I18nText } from '@/types/content';

export interface CeremonyMedal {
  key: string;
  title: string;
  glyph: string;
}

export interface CeremonyModel {
  day: number;
  totalDays: number;
  trailTitle: string;
  status: CeremonyStatus;
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
  const trailTitle = text(source.state.trail_title as I18nText | undefined, lang) || String(source.state.trail ?? '');
  return {
    day,
    totalDays,
    trailTitle,
    status: statusOf(pass, result),
    last: totalDays > 0 && num(source.state.days_done) >= totalDays,
    newMedals: (result.awards ?? [])
      .filter((r) => MEDAL_KINDS.has(r.kind))
      .map((r) => ({ key: r.key, title: text(r.title, lang), glyph: text(r.title, lang).slice(0, 3).toUpperCase() })),
    txSignature: pass?.tx_signature ?? null,
    assetAddress: pass?.asset_address ?? null,
  };
}

/** True when the call is worth repeating: transactions are still due and nothing blocks them. */
export const shouldContinue = (r: PassportResult): boolean => r.remaining > 0 && !r.mint?.blocked;
