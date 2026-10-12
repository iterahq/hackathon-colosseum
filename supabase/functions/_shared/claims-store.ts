import type { ActivityNode, ProgressRow, UnitNode } from './awards.ts';
import { graphOf } from './capability-graph.ts';
import { claimsOf, evidenceDocument, expectedClaims, journeyOf, sha256Hex, type AttemptRow, type ProvenClaim } from './claims.ts';
import type { IteraClient } from './db.ts';
import { lessonProof, verifiedShare, type PassingAttempt } from './proof.ts';

interface PassportRow {
  id: string;
  achievement_key: string;
  ref_id: string;
  state: Record<string, unknown>;
  wallet_address: string | null;
}

export const CLAIM_COLUMNS = 'user_achievement_id,claim_id,lesson_id,evidence_hash,tx_signature,proven_at';

/** The proven claims of these certification rows, from the table of record, oldest first. */
export async function claimsByRow(db: IteraClient, rowIds: string[]): Promise<Map<string, ProvenClaim[]>> {
  const byRow = new Map<string, ProvenClaim[]>();
  if (rowIds.length === 0) return byRow;
  const { data, error } = await db.from('claim_proofs').select('user_achievement_id,claim_id,evidence_hash,tx_signature').in('user_achievement_id', rowIds).order('proven_at').order('claim_id');
  if (error) throw new Error(`claim_proofs: ${error.message}`);
  for (const entry of (data ?? []) as Array<{ user_achievement_id: string; claim_id: string; evidence_hash: string; tx_signature: string | null }>) {
    byRow.set(entry.user_achievement_id, [...(byRow.get(entry.user_achievement_id) ?? []), { id: entry.claim_id, hash: entry.evidence_hash, tx: entry.tx_signature }]);
  }
  return byRow;
}

/**
 * Records the claims the stamped days of these certifications prove and are
 * not recorded yet, each with its evidence document. Returns how many rows it
 * wrote. The wallet is the one the certification is (or is about to be) minted to.
 */
export async function recordClaims(
  db: IteraClient,
  rows: PassportRow[],
  wallet: string,
  learning: { units: UnitNode[]; activities: ActivityNode[]; progress: ProgressRow[]; attempts?: ReadonlyMap<string, PassingAttempt> },
): Promise<number> {
  const attempts = learning.attempts ?? new Map<string, PassingAttempt>();
  const trailOf = new Map(learning.units.map((unit) => [unit.id, unit.ordinal]));
  const completedAt = new Map(learning.progress.flatMap((row) => (row.completed_at ? [[row.activity_id, row.completed_at] as const] : [])));
  const inserts: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const graph = graphOf(row.state.program_slug);
    const trail = trailOf.get(row.ref_id);
    if (row.achievement_key !== 'trail_pass' || !graph || trail === undefined) continue;
    const recorded = new Set(claimsOf(row.state).map((entry) => entry.id));
    for (const { claim, lessonId } of expectedClaims(row.state, trail)) {
      if (recorded.has(claim.id)) continue;
      const lessonActivities = learning.activities.filter((activity) => activity.lesson_id === lessonId);
      const graded = (id: string) => (attempts.get(id)?.mode === 'server' ? (attempts.get(id) as PassingAttempt).answer_hash : null);
      const activities = lessonActivities.flatMap((activity) =>
        completedAt.has(activity.id) ? [{ id: activity.id, completed_at: new Date(completedAt.get(activity.id) as string).toISOString(), attempt: graded(activity.id) }] : [],
      );
      const proof = lessonProof(lessonActivities.map((activity) => activity.id), attempts);
      if (activities.length === 0) continue;
      const owner = row.wallet_address ?? wallet;
      const evidence = evidenceDocument({ claim: claim.id, program: graph.program, wallet: owner, lessonId, activities, verified: proof ? verifiedShare(proof) : null });
      inserts.push({ user_achievement_id: row.id, claim_id: claim.id, lesson_id: lessonId, wallet: owner, evidence, evidence_hash: await sha256Hex(evidence) });
    }
  }
  if (inserts.length === 0) return 0;
  const { data, error } = await db.from('claim_proofs').upsert(inserts, { onConflict: 'user_achievement_id,claim_id', ignoreDuplicates: true }).select('claim_id');
  if (error) throw new Error(`claim_proofs insert: ${error.message}`);
  return data?.length ?? 0;
}

/** After a confirmed write of the asset's attributes: every claim of the row that had no transaction gets this one. */
export async function markClaimsWritten(db: IteraClient, rowId: string, signature: string | null): Promise<void> {
  if (!signature) return;
  const { error } = await db.from('claim_proofs').update({ tx_signature: signature, written_at: new Date().toISOString() }).eq('user_achievement_id', rowId).is('tx_signature', null);
  if (error) throw new Error(`claim_proofs settle: ${error.message}`);
}

export interface WalletGraphData {
  trails: Array<{ id: string; trail: number; title: Record<string, string> }>;
  proofs: Array<{ user_achievement_id: string; claim_id: string; evidence_hash: string; tx_signature: string | null; proven_at: string; evidence?: string | null }>;
}

/** The trails of a program and every claim recorded for these certification rows. */
export async function loadGraphData(db: IteraClient, programSlug: string, rowIds: string[]): Promise<WalletGraphData> {
  const [units, proofs] = await Promise.all([
    db.from('units').select('id,ordinal,title_i18n,programs!inner(slug)').eq('programs.slug', programSlug).order('ordinal'),
    rowIds.length > 0
      ? db.from('claim_proofs').select(`${CLAIM_COLUMNS},evidence`).in('user_achievement_id', rowIds).order('proven_at')
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (units.error) throw new Error(`units: ${units.error.message}`);
  if (proofs.error) throw new Error(`claim_proofs: ${proofs.error.message}`);
  return {
    trails: ((units.data ?? []) as Array<{ id: string; ordinal: number; title_i18n: Record<string, string> }>).map((unit) => ({ id: unit.id, trail: unit.ordinal, title: unit.title_i18n })),
    proofs: (proofs.data ?? []) as WalletGraphData['proofs'],
  };
}

/** The evidence document of one claim of a wallet, as it was hashed. `null` when that wallet has not proven it. */
export async function loadEvidence(db: IteraClient, wallet: string, claimId: string): Promise<{ claim: string; lesson_id: string; evidence: string; evidence_hash: string; tx_signature: string | null } | null> {
  const { data, error } = await db
    .from('claim_proofs')
    .select('claim_id,lesson_id,evidence,evidence_hash,tx_signature')
    .eq('wallet', wallet)
    .eq('claim_id', claimId)
    .order('proven_at')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`claim_proofs evidence: ${error.message}`);
  return data ? { claim: data.claim_id, lesson_id: data.lesson_id, evidence: data.evidence, evidence_hash: data.evidence_hash, tx_signature: data.tx_signature } : null;
}

const JOURNEY_ROWS = 600;

/**
 * The attempt track behind one claim of a wallet: the verdicts of the lesson
 * that proved it, from `graded_attempts`. Reads the verdict, the mode and the
 * activity only; never an answer or a hash. `null` when that wallet has not
 * proven the claim.
 */
export async function loadJourney(db: IteraClient, wallet: string, claimId: string): Promise<ReturnType<typeof journeyOf> | null> {
  const proof = await db
    .from('claim_proofs')
    .select('lesson_id,user_achievements!inner(user_id)')
    .eq('wallet', wallet)
    .eq('claim_id', claimId)
    .order('proven_at')
    .limit(1)
    .maybeSingle();
  if (proof.error) throw new Error(`claim_proofs journey: ${proof.error.message}`);
  const found = proof.data as unknown as { lesson_id: string; user_achievements: { user_id: string } | null } | null;
  if (!found?.user_achievements?.user_id) return null;
  const attempts = await db
    .from('graded_attempts')
    .select('activity_id,mode,passed')
    .eq('user_id', found.user_achievements.user_id)
    .eq('lesson_id', found.lesson_id)
    .order('created_at')
    .order('id')
    .limit(JOURNEY_ROWS);
  if (attempts.error) throw new Error(`graded_attempts journey: ${attempts.error.message}`);
  return journeyOf((attempts.data ?? []) as AttemptRow[]);
}

/**
 * What our tables hold for a wallet, with no chain read: every claim recorded
 * for it and the asset it was written to. For the first paint of a profile;
 * the reader checks the chain afterwards.
 */
export async function loadRecordedProofs(db: IteraClient, wallet: string): Promise<Array<{ claim_id: string; asset: string; evidence_hash: string; tx_signature: string | null; proven_at: string }>> {
  const { data, error } = await db
    .from('claim_proofs')
    .select('claim_id,evidence_hash,tx_signature,proven_at,user_achievements!inner(asset_address,mint_status)')
    .eq('wallet', wallet)
    .order('proven_at')
    .limit(200);
  if (error) throw new Error(`claim_proofs recorded: ${error.message}`);
  const rows = (data ?? []) as unknown as Array<{ claim_id: string; evidence_hash: string; tx_signature: string | null; proven_at: string; user_achievements: { asset_address: string | null; mint_status: string } | null }>;
  return rows.flatMap((row) =>
    row.user_achievements?.mint_status === 'minted' && row.user_achievements.asset_address
      ? [{ claim_id: row.claim_id, asset: row.user_achievements.asset_address, evidence_hash: row.evidence_hash, tx_signature: row.tx_signature, proven_at: row.proven_at }]
      : [],
  );
}
