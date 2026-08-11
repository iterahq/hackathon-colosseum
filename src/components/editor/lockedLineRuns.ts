import type { EditableRegion } from '@iterahq/activities';

/**
 * The lines a `code` snack does NOT accept typing on, as contiguous runs.
 *
 * A line touched by any region is editable — including the one the region
 * starts or ends mid-way through, since dimming it would fade text the learner
 * is allowed to change. No regions means the whole file is open, so there is
 * nothing to fade (`isEditAllowed` says the same).
 *
 * The two lines HUGGING a region are left bright even though they are locked:
 * they carry the `>>>` / `<<<` markers, and the marker line is where the author
 * writes what to type. Fading the instruction along with the scenery would dim
 * exactly the sentence the band exists to point at.
 */
export function lockedLineRuns(
  regions: readonly EditableRegion[],
  lineCount: number
): { startLineNumber: number; endLineNumber: number }[] {
  if (regions.length === 0) return [];
  const bright = new Set<number>();
  for (const r of regions) {
    for (let line = r.startLineNumber - 1; line <= r.endLineNumber + 1; line++) bright.add(line);
  }
  const runs: { startLineNumber: number; endLineNumber: number }[] = [];
  let startLineNumber: number | null = null;
  for (let line = 1; line <= lineCount + 1; line++) {
    if (line <= lineCount && !bright.has(line)) {
      startLineNumber ??= line;
      continue;
    }
    if (startLineNumber === null) continue;
    runs.push({ startLineNumber, endLineNumber: line - 1 });
    startLineNumber = null;
  }
  return runs;
}
