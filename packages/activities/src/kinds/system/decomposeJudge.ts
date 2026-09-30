import type { DecomposeCanvasSpec, DecomposePartSpec, SceneLocalizedText } from '../../specs.js';
import { expandRef } from './viewModel.js';

export type DecomposeVerdict =
  | { ok: true }
  | { ok: false; reason: 'unassigned'; unassigned: string[] }
  | { ok: false; reason: 'must_group' | 'must_separate'; index: number; hint?: SceneLocalizedText };

const PART_PALETTE = ['#3B82F6', '#22C55E', '#EC4899', '#F59E0B', '#8B5CF6', '#14B8A6', '#EF4444', '#0EA5E9'];

const NAMED: Record<string, string> = {
  blue: '#3B82F6',
  green: '#22C55E',
  yellow: '#EAB308',
  purple: '#8B5CF6',
  orange: '#F97316',
  pink: '#EC4899',
  red: '#EF4444',
  gray: '#9CA3AF',
};

export function partColor(part: DecomposePartSpec, index: number): string {
  if (part.color) return NAMED[part.color] ?? part.color;
  return PART_PALETTE[index % PART_PALETTE.length];
}

export function partDepth(parts: readonly DecomposePartSpec[], id: string): number {
  const byId = new Map(parts.map((p) => [p.id, p]));
  let depth = 0;
  const seen = new Set([id]);
  let cur = byId.get(id)?.inside;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    depth += 1;
    cur = byId.get(cur)?.inside;
  }
  return depth;
}

/** The part ids a part contains, itself included. */
export function partFamily(parts: readonly DecomposePartSpec[], id: string): Set<string> {
  const family = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const part of parts) {
      if (part.inside && family.has(part.inside) && !family.has(part.id)) {
        family.add(part.id);
        grew = true;
      }
    }
  }
  return family;
}

/** The list-instance suffix of a rendered id (`item#2` → `#2`), or `''` outside a list. */
function instanceKey(id: string): string {
  const hash = id.lastIndexOf('#');
  return hash === -1 ? '' : id.slice(hash);
}

/**
 * The outlines one part draws: runs of contiguous leaves, in document order.
 *
 * A single bounding box over non-adjacent leaves would swallow the leaves in
 * between. With `perInstance`, a run also breaks at every list instance, so a
 * part made of repeated items (`item#0`, `item#1`, …) outlines each item on its
 * own. A part that contains other parts passes `false`: it is the container,
 * and its outline wraps them all.
 */
export function regionSegments(members: readonly string[], leaves: readonly string[], perInstance: boolean): string[][] {
  const wanted = new Set(members);
  const segments: string[][] = [];
  let run: string[] = [];
  let runKey = '';
  for (const leaf of leaves) {
    if (!wanted.has(leaf)) {
      if (run.length > 0) segments.push(run);
      run = [];
      continue;
    }
    const key = perInstance ? instanceKey(leaf) : '';
    if (run.length > 0 && key !== runKey) {
      segments.push(run);
      run = [];
    }
    run.push(leaf);
    runKey = key;
  }
  if (run.length > 0) segments.push(run);
  return segments;
}

/**
 * The assignment a finished attempt recorded, as `[[leaf, part], …]` pairs.
 * Restores only a complete, known, judge-approved assignment — anything else
 * restores nothing, exactly like the graded kinds' replay readers.
 */
export function restorableAssignment(
  raw: unknown,
  spec: Pick<DecomposeCanvasSpec, 'parts' | 'must_group' | 'must_separate' | 'require_all_assigned'>,
  leaves: readonly string[],
): Record<string, string> | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const partIds = new Set((spec.parts ?? []).map((p) => p.id));
  const assignment: Record<string, string> = {};
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length !== 2) return undefined;
    const [leaf, part] = entry;
    if (typeof leaf !== 'string' || typeof part !== 'string') return undefined;
    if (!leaves.includes(leaf) || !partIds.has(part) || leaf in assignment) return undefined;
    assignment[leaf] = part;
  }
  return judgeDecomposition(spec, leaves, assignment).ok ? assignment : undefined;
}

function partsOf(ref: string, leaves: readonly string[], partIds: ReadonlySet<string>, assignment: Readonly<Record<string, string>>) {
  const expanded = expandRef(ref, leaves);
  if (expanded.length === 0 && partIds.has(ref)) return { parts: [ref], missing: false };
  return {
    parts: expanded.map((leaf) => assignment[leaf]).filter((p): p is string => !!p),
    missing: expanded.some((leaf) => !assignment[leaf]),
  };
}

/** Constraints, never an answer key: any grouping that satisfies every rule is right. */
export function judgeDecomposition(
  spec: Pick<DecomposeCanvasSpec, 'parts' | 'must_group' | 'must_separate' | 'require_all_assigned'>,
  leaves: readonly string[],
  assignment: Readonly<Record<string, string>>,
): DecomposeVerdict {
  const partIds = new Set((spec.parts ?? []).map((p) => p.id));
  if (spec.require_all_assigned !== false) {
    const unassigned = leaves.filter((leaf) => !assignment[leaf]);
    if (unassigned.length > 0) return { ok: false, reason: 'unassigned', unassigned };
  }
  const groups = spec.must_group ?? [];
  for (let i = 0; i < groups.length; i += 1) {
    const found = groups[i].ids.map((ref) => partsOf(ref, leaves, partIds, assignment));
    const all = found.flatMap((f) => f.parts);
    if (found.some((f) => f.missing) || new Set(all).size > 1) {
      return { ok: false, reason: 'must_group', index: i, hint: groups[i].hint };
    }
  }
  const separations = spec.must_separate ?? [];
  for (let i = 0; i < separations.length; i += 1) {
    const [a, b] = separations[i].ids.map((ref) => new Set(partsOf(ref, leaves, partIds, assignment).parts));
    if ([...a].some((p) => b.has(p))) {
      return { ok: false, reason: 'must_separate', index: i, hint: separations[i].hint };
    }
  }
  return { ok: true };
}
