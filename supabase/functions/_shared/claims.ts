import type { Lang } from './art.ts';
import { claimsOfDay, graphOf, nextClaim, type CapabilityClaim, type CapabilityGraph } from './capability-graph.ts';

export const CLAIM_PREFIX = 'claim:';
export const EVIDENCE_VERSION = 1;
/** Version 2 adds, per activity, the hash of the answer the server graded, and the share it graded. */
export const EVIDENCE_VERSION_GRADED = 2;
/** Hex characters of the evidence hash written on chain, longest first. A crowded asset gets a shorter prefix. */
export const HASH_LENGTHS = [16, 12, 8] as const;
/**
 * Bytes an `updatePlugin(Attributes)` transaction leaves for the attribute
 * list: 1232 (packet) minus one signature, the message header, five account
 * keys, the blockhash and the instruction framing.
 */
export const ATTRIBUTE_BUDGET_BYTES = 940;

/** One proven claim as a certification row carries it in `state.claims`. */
export interface ProvenClaim {
  id: string;
  /** SHA-256 of the evidence document, 64 hex characters. */
  hash: string;
  /** The transaction that wrote it to the asset; `null` until one did. */
  tx: string | null;
}

export interface EvidenceActivity {
  id: string;
  completed_at: string;
  /** `graded_attempts.answer_hash` of the first answer the server graded as correct; absent when it graded none. */
  attempt?: string | null;
}

export interface EvidenceInput {
  claim: string;
  program: string;
  wallet: string;
  lessonId: string;
  activities: EvidenceActivity[];
  /** "12/14": answers the server graded over the answers that had something to grade. Makes the document version 2. */
  verified?: string | null;
}

interface Attribute {
  key: string;
  value: string;
}

const HEX_64 = /^[0-9a-f]{64}$/;
const encoder = new TextEncoder();

/**
 * The evidence document of one claim: who, which claim, which lesson, and when
 * each activity of that lesson was completed. It is stored verbatim and its
 * SHA-256 goes on chain, so anyone holding the document can check it.
 */
export function evidenceDocument(input: EvidenceInput): string {
  const activities = [...input.activities].sort((a, b) => a.id.localeCompare(b.id));
  const completedAt = activities.reduce((latest, entry) => (entry.completed_at > latest ? entry.completed_at : latest), '');
  const head = { issuer: 'itera', claim: input.claim, program: input.program, wallet: input.wallet, lesson_id: input.lessonId, completed_at: completedAt };
  if (typeof input.verified === 'string') {
    return JSON.stringify({
      v: EVIDENCE_VERSION_GRADED,
      ...head,
      verified: input.verified,
      activities: activities.map((entry) => [entry.id, entry.completed_at, entry.attempt ?? null]),
    });
  }
  return JSON.stringify({ v: EVIDENCE_VERSION, ...head, activities: activities.map((entry) => [entry.id, entry.completed_at]) });
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The well-formed claims of a certification row, in the order they were stored. */
export function claimsOf(state: Record<string, unknown>): ProvenClaim[] {
  if (!Array.isArray(state.claims)) return [];
  const seen = new Set<string>();
  const claims: ProvenClaim[] = [];
  for (const entry of state.claims) {
    if (!entry || typeof entry !== 'object') continue;
    const { id, hash, tx } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,24}$/.test(id) || typeof hash !== 'string' || !HEX_64.test(hash) || seen.has(id)) continue;
    seen.add(id);
    claims.push({ id, hash, tx: typeof tx === 'string' && tx.length > 0 ? tx : null });
  }
  return claims;
}

function sameClaims(a: readonly ProvenClaim[], b: readonly ProvenClaim[]): boolean {
  return a.length === b.length && a.every((entry, index) => entry.id === b[index].id && entry.hash === b[index].hash && entry.tx === b[index].tx);
}

/** The row with `state.claims` set from the table of record. Untouched when they already agree. */
export function withClaims<Row extends { state: Record<string, unknown> }>(row: Row, claims: readonly ProvenClaim[]): Row {
  const wanted = claimsOf({ claims });
  if (sameClaims(wanted, claimsOf(row.state)) && (wanted.length > 0 || !('claims' in row.state))) return row;
  return { ...row, state: { ...row.state, claims: wanted } };
}

export function hasUnwrittenClaims(state: Record<string, unknown>): boolean {
  return claimsOf(state).some((entry) => entry.tx === null);
}

/** Borsh size of an attribute list entry: two length-prefixed strings. */
export function attributeBytes(attributes: readonly Attribute[]): number {
  return attributes.reduce((total, { key, value }) => total + 8 + encoder.encode(key).length + encoder.encode(value).length, 0);
}

/**
 * `claim:<id>` = a prefix of the evidence hash, one attribute per proven claim.
 * The prefix is as long as the transaction allows next to the other attributes.
 */
export function claimAttributes(claims: readonly ProvenClaim[], others: readonly Attribute[]): Attribute[] {
  if (claims.length === 0) return [];
  const used = attributeBytes(others);
  for (const length of HASH_LENGTHS) {
    const attributes = claims.map(({ id, hash }) => ({ key: `${CLAIM_PREFIX}${id}`, value: hash.slice(0, length) }));
    if (used + attributeBytes(attributes) <= ATTRIBUTE_BUDGET_BYTES) return attributes;
  }
  throw new Error(`claims do not fit the asset: ${claims.length} claims next to ${used} bytes of attributes`);
}

/** The claims an asset carries on chain: id -> the hash prefix that was written. */
export function onchainClaims(attributes: readonly Attribute[]): Map<string, string> {
  const found = new Map<string, string>();
  for (const { key, value } of attributes) {
    if (key.startsWith(CLAIM_PREFIX) && /^[0-9a-f]{8,64}$/.test(value)) found.set(key.slice(CLAIM_PREFIX.length), value);
  }
  return found;
}

/** The claims a certification should hold for the days it has stamped, in graph order. */
export function expectedClaims(state: Record<string, unknown>, trail: number): Array<{ claim: CapabilityClaim; lessonId: string }> {
  const graph = graphOf(state.program_slug);
  const days = Array.isArray(state.stamped_days) ? state.stamped_days : [];
  const lessons = Array.isArray(state.stamped_lesson_ids) ? state.stamped_lesson_ids : [];
  if (!graph || days.length !== lessons.length) return [];
  const expected: Array<{ claim: CapabilityClaim; lessonId: string }> = [];
  days.forEach((day, index) => {
    const lessonId = lessons[index];
    if (typeof day !== 'number' || typeof lessonId !== 'string') return;
    for (const entry of claimsOfDay(graph, trail, day)) expected.push({ claim: entry, lessonId });
  });
  return expected.sort((a, b) => graph.claims.indexOf(a.claim) - graph.claims.indexOf(b.claim));
}

export type NodeStatus = 'verified' | 'recorded' | 'open';

export interface GraphProof {
  asset: string;
  /** Read from the asset's attributes in this request; `null` when the asset does not carry the claim. */
  onchain_value: string | null;
  evidence_hash: string;
  tx_signature: string | null;
  proven_at: string | null;
}

export interface GraphInput {
  graph: CapabilityGraph;
  lang: Lang;
  trails: Array<{ trail: number; title: string }>;
  /** Claim id -> what our tables and the chain say about it. Only claims of assets that passed verification belong here. */
  proofs: Map<string, GraphProof>;
  explorer: (type: 'address' | 'tx', value: string | null) => string | null;
}

/**
 * The capability graph of one wallet. A node is `verified` only when the asset
 * read from chain carries the claim and its value is a prefix of our evidence
 * hash; `recorded` when our tables have it and the chain does not (yet).
 */
export function buildGraph(input: GraphInput) {
  const { graph, lang, proofs } = input;
  const nodes = graph.claims.map((entry) => {
    const proof = proofs.get(entry.id) ?? null;
    const verified = proof !== null && proof.onchain_value !== null && proof.evidence_hash.startsWith(proof.onchain_value);
    const status: NodeStatus = verified ? 'verified' : proof ? 'recorded' : 'open';
    return {
      id: entry.id,
      trail: entry.trail,
      day: entry.day,
      title: entry.title[lang] ?? entry.title.en,
      requires: entry.requires,
      status,
      proof: proof && {
        asset: proof.asset,
        attribute: `${CLAIM_PREFIX}${entry.id}`,
        onchain_value: proof.onchain_value,
        evidence_hash: proof.evidence_hash,
        tx_signature: proof.tx_signature,
        proven_at: proof.proven_at,
        asset_explorer_url: input.explorer('address', proof.asset),
        tx_explorer_url: input.explorer('tx', proof.tx_signature),
      },
    };
  });
  const verified = nodes.filter((node) => node.status === 'verified');
  const proven = new Set(nodes.filter((node) => node.status !== 'open').map((node) => node.id));
  return {
    program: graph.program,
    version: graph.version,
    total: nodes.length,
    verified_count: verified.length,
    trails: input.trails,
    next: nextClaim(graph, proven)?.id ?? null,
    nodes,
  };
}

interface CertificationRow {
  id: string;
  achievement_key: string;
  asset_address: string | null;
}

/**
 * Joins what our tables recorded with what the chain holds. A claim of an asset
 * that failed verification (not this wallet's, not our collection, not frozen)
 * keeps `onchain_value: null`, so it can never read as verified.
 */
export function graphProofs(input: {
  rows: readonly CertificationRow[];
  proofs: ReadonlyArray<{ user_achievement_id: string; claim_id: string; evidence_hash: string; tx_signature: string | null; proven_at: string }>;
  attributesOf: (asset: string) => readonly Attribute[] | null;
  isVerified: (asset: string) => boolean;
}): Map<string, GraphProof> {
  const assetOf = new Map(input.rows.flatMap((row) => (row.achievement_key === 'trail_pass' && row.asset_address ? [[row.id, row.asset_address] as const] : [])));
  const found = new Map<string, GraphProof>();
  for (const proof of input.proofs) {
    const asset = assetOf.get(proof.user_achievement_id);
    if (!asset || found.has(proof.claim_id)) continue;
    const attributes = input.isVerified(asset) ? input.attributesOf(asset) : null;
    found.set(proof.claim_id, {
      asset,
      onchain_value: attributes ? (onchainClaims(attributes).get(proof.claim_id) ?? null) : null,
      evidence_hash: proof.evidence_hash,
      tx_signature: proof.tx_signature,
      proven_at: proof.proven_at,
    });
  }
  return found;
}
