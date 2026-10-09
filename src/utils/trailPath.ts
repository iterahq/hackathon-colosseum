import type { DayState, PathNode, PathOptions, TrailPath } from '@/types/trailDashboard';

/** The zig-zag path through a trail's days: the whole line, the finished part, and the live leg to the current day. */
export function trailPath(states: readonly DayState[], o: PathOptions): TrailPath {
  const n = states.length;
  const { W, H, A, r, vertical } = o;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = i % 2 ? A : -A;
    const step = n > 1 ? i : 0;
    if (vertical) pts.push([W / 2 + a, r + 8 + step * ((H - 2 * r - 16) / Math.max(1, n - 1))]);
    else pts.push([r + 8 + step * ((W - 2 * r - 16) / Math.max(1, n - 1)), H / 2 + a]);
  }

  const doneCount = states.filter((s) => s === 'done').length;
  const currentDay = states.indexOf('current') + 1;
  let base = '';
  let done = '';
  let live = '';
  for (let i = 1; i < n; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const seg = vertical
      ? `M${x0} ${y0} C${x0} ${(y0 + y1) / 2} ${x1} ${(y0 + y1) / 2} ${x1} ${y1} `
      : `M${x0} ${y0} C${(x0 + x1) / 2} ${y0} ${(x0 + x1) / 2} ${y1} ${x1} ${y1} `;
    base += seg;
    if (i + 1 <= doneCount) done += seg;
    else if (i + 1 === currentDay) live += seg;
  }
  if (currentDay === 1) {
    const [x, y] = pts[0];
    live += vertical ? `M${x} ${y - r - 24} L${x} ${y}` : `M${x - r - 30} ${y} L${x} ${y}`;
  }

  const big = r >= 20;
  const nodes: PathNode[] = pts.map(([cx, cy], i) => {
    const state = states[i];
    const current = state === 'current';
    const icon =
      state === 'done'
        ? `M${cx - r * 0.36} ${cy} l${r * 0.26} ${r * 0.28} l${r * 0.48} -${r * 0.56}`
        : !current && big
          ? `M${cx - 5} ${cy - 1} h10 v8 h-10 z M${cx - 3} ${cy - 1} v-3 a3 3 0 0 1 6 0 v3`
          : '';
    return {
      cx,
      cy,
      day: i + 1,
      state,
      r: current ? r * 1.15 : r,
      ring: current ? r * 1.15 + 6 : 0,
      icon,
      label: current && big ? String(i + 1).padStart(2, '0') : '',
      fontSize: r * 0.62,
      textY: cy + r * 0.22,
    };
  });
  return { base: base || 'M0 0', done: done || 'M0 0', live: live || 'M0 0', nodes };
}
