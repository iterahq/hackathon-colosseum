import type { IteraClient } from './db.ts';
import type { GradeMode } from './grading.ts';
import { sha256Hex } from './sha256.ts';

/** The first passing server-recorded attempt of an activity. */
export interface PassingAttempt {
  activity_id: string;
  mode: GradeMode;
  answer_hash: string;
  spec_hash: string;
  created_at: string;
}

/**
 * What stands behind a completed lesson. `verified`: the server graded the
 * answer. `self_reported`: the server recorded the player's claim.
 * `participation`: nothing to grade. `legacy`: completed before server grading
 * existed, no attempt row. `evidence` commits to the attempt rows.
 */
export interface LessonProof {
  verified: number;
  self_reported: number;
  participation: number;
  legacy: number;
  evidence: string;
}

export function emptyProof(): LessonProof {
  return { verified: 0, self_reported: 0, participation: 0, legacy: 0, evidence: '' };
}

/** `null` when no activity of the lesson has an attempt: there is nothing to state. */
export function lessonProof(activityIds: readonly string[], attempts: ReadonlyMap<string, PassingAttempt>): LessonProof | null {
  const proof = emptyProof();
  const lines: string[] = [];
  for (const activityId of [...activityIds].sort()) {
    const attempt = attempts.get(activityId);
    if (!attempt) {
      proof.legacy += 1;
      continue;
    }
    if (attempt.mode === 'server') proof.verified += 1;
    else if (attempt.mode === 'self_reported') proof.self_reported += 1;
    else proof.participation += 1;
    lines.push([activityId, attempt.mode, attempt.answer_hash, attempt.spec_hash, attempt.created_at].join('|'));
  }
  if (lines.length === 0) return null;
  return { ...proof, evidence: sha256Hex(lines.join('\n')) };
}

/** The proofs of several lessons as one: counts added, evidence hashed over the lesson evidences in the given order. */
export function combineProofs(proofs: readonly LessonProof[]): LessonProof | null {
  if (proofs.length === 0) return null;
  const total = emptyProof();
  for (const proof of proofs) {
    total.verified += proof.verified;
    total.self_reported += proof.self_reported;
    total.participation += proof.participation;
    total.legacy += proof.legacy;
  }
  return { ...total, evidence: sha256Hex(proofs.map((proof) => proof.evidence).join('\n')) };
}

/**
 * "12/14": answers the server graded, over the answers that had something to grade. Completions from
 * before server grading are named, never folded in: "2/2 +14 legacy".
 */
export function verifiedShare(proof: Pick<LessonProof, 'verified' | 'self_reported'> & { legacy?: number }): string {
  const share = `${proof.verified}/${proof.verified + proof.self_reported}`;
  return proof.legacy && proof.legacy > 0 ? `${share} +${proof.legacy} legacy` : share;
}

export function isLessonProof(value: unknown): value is LessonProof {
  if (typeof value !== 'object' || value === null) return false;
  const proof = value as Record<string, unknown>;
  return (
    ['verified', 'self_reported', 'participation', 'legacy'].every((field) => Number.isInteger(proof[field])) && typeof proof.evidence === 'string'
  );
}

const PAGE_SIZE = 1000;

/** Every activity the learner has a passing attempt for, with the first such attempt. */
export async function loadPassingAttempts(db: IteraClient, userId: string): Promise<Map<string, PassingAttempt>> {
  const first = new Map<string, PassingAttempt>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from('graded_attempts')
      .select('activity_id,mode,answer_hash,spec_hash,created_at')
      .eq('user_id', userId)
      .eq('passed', true)
      .order('created_at')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`graded_attempts: ${error.message}`);
    for (const row of (data ?? []) as PassingAttempt[]) {
      if (!first.has(row.activity_id)) first.set(row.activity_id, row);
    }
    if (!data || data.length < PAGE_SIZE) return first;
  }
}
