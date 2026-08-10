/**
 * EDITABLE REGIONS — "edite só o que precisa ser editado".
 *
 * A `code` activity is a whole file, and a learner who cannot yet READ code
 * treats every line as equally at risk: the fastest way to lose a 14-year-old
 * is to have them delete the `export default` and get a blank preview they
 * cannot explain. The guided variant (`blanks`) solves this by removing the
 * editor entirely — but a blank is graded by its answer TEXT, so it cannot be
 * combined with `checks[]`, which grade the rendered DOM. Regions are the
 * middle ground: the learner still WRITES code, in an editor, graded by the
 * DOM — just not everywhere.
 *
 * The region is declared IN the starter, by comment lines, and NOT by a new
 * spec field. Two consequences, both deliberate:
 *
 *  · no `activity-spec` bump / republish / range bump to ship this;
 *  · the markers survive every round-trip the source already makes — the saved
 *    draft, the "recomeçar" reset, the live-class mirror — so the regions can
 *    be recomputed from the CURRENT text at any moment instead of being
 *    positions someone has to keep in sync with an edit that just happened.
 *
 * They are comments, so the preview transpiles and renders exactly as before,
 * and an activity with no markers keeps the fully open editor. That is what
 * makes this opt-in PER ACTIVITY: the author (the professor writing the class)
 * decides where the walls are, and a class that wants the open editor simply
 * writes no markers.
 */

import type { EditableRegion } from '../ports.js';

export type { EditableRegion };

/**
 * `>>>` opens, `<<<` closes.
 *
 * Chosen because neither sequence occurs in legitimate TSX — unlike `{{ }}`,
 * which collides with `style={{ color }}` (the same collision that made the
 * blank token namespace itself as `{{blank:…}}`). The comment syntax around it
 * is free (`//`, `/* *\/`, `{/* *\/}`) so the marker reads naturally in both
 * plain TS and inside JSX, where only a `{/* … *\/}` comment is legal.
 */
const OPEN = '>>>';
const CLOSE = '<<<';

/** Strip the comment scaffolding so `{/* >>> edite aqui *\/}` and `// >>>` match alike. */
function markerBody(line: string): string {
  return line
    .trim()
    .replace(/^\{?\s*/, '')
    .replace(/^(\/\/|\/\*)\s*/, '')
    .replace(/\s*(\*\/)?\s*\}?$/, '')
    .trim();
}

export function isOpenMarker(line: string): boolean {
  return markerBody(line).startsWith(OPEN);
}

export function isCloseMarker(line: string): boolean {
  return markerBody(line).startsWith(CLOSE);
}

/**
 * The lines BETWEEN each `>>>` / `<<<` pair, as ranges.
 *
 * The marker lines themselves are never editable — that is what stops a learner
 * from deleting a wall and then, quite reasonably, editing everything. A pair
 * with nothing between it yields no region: an empty region would render as an
 * invisible zero-width hole nobody can type into, which reads as "the editor is
 * broken", so it is treated as an authoring mistake and ignored.
 *
 * Unbalanced markers are ignored the same way (a dangling `>>>` does NOT open a
 * region to end-of-file): failing closed here means a typo costs an exercise
 * that is locked, never one that is silently wide open.
 */
export function parseEditableRegions(text: string): EditableRegion[] {
  const lines = text.split('\n');
  const regions: EditableRegion[] = [];
  let openIndex: number | null = null;

  lines.forEach((line, index) => {
    if (isOpenMarker(line)) {
      openIndex = index;
      return;
    }
    if (!isCloseMarker(line) || openIndex === null) return;

    const firstInner = openIndex + 1;
    const lastInner = index - 1;
    openIndex = null;
    if (lastInner < firstInner) return;

    regions.push({
      startLineNumber: firstInner + 1,
      startColumn: 1,
      endLineNumber: lastInner + 1,
      endColumn: (lines[lastInner]?.length ?? 0) + 1,
    });
  });

  return regions;
}

export function hasEditableRegions(text: string): boolean {
  return parseEditableRegions(text).length > 0;
}

interface EditRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

function isBefore(
  aLine: number,
  aCol: number,
  bLine: number,
  bCol: number,
): boolean {
  return aLine < bLine || (aLine === bLine && aCol <= bCol);
}

/**
 * Is this edit entirely inside one region?
 *
 * Edges are INCLUSIVE, so typing at the very start or the very end of the
 * region works — a region you cannot append to would force the learner to
 * always leave a trailing character behind. An edit spanning two regions is
 * rejected even though both ends are "editable": it would have to swallow the
 * locked code between them.
 */
export function isEditAllowed(
  regions: readonly EditableRegion[],
  range: EditRange,
): boolean {
  if (regions.length === 0) return true;
  return regions.some(
    (r) =>
      isBefore(r.startLineNumber, r.startColumn, range.startLineNumber, range.startColumn) &&
      isBefore(range.endLineNumber, range.endColumn, r.endLineNumber, r.endColumn),
  );
}
