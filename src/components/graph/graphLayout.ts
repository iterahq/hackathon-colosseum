export type GraphMode = 'wide' | 'narrow';

export interface LayoutInput {
  id: string;
  trail: number;
  day: number;
  requires: string[];
}

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
  path: string;
  crossTrail: boolean;
}

export interface LayoutTrail {
  trail: number;
  x: number;
  y: number;
  width: number;
}

export interface GraphLayout {
  width: number;
  height: number;
  radius: number;
  labelWidth: number;
  labelHeight: number;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  trails: LayoutTrail[];
}

export const RADIUS = 34;
export const LABEL_HEIGHT = 58;
const HEADER_HEIGHT = 64;
const ROW_HEIGHT = RADIUS * 2 + 12 + LABEL_HEIGHT + 24;
const COLUMN_GAP = 20;
const MIN_WIDTH = 280;

const round = (n: number) => Math.round(n * 10) / 10;

export function edgePath(x1: number, y1: number, x2: number, y2: number, channelX?: number): string {
  if (y2 - y1 < RADIUS * 2) {
    const dir = x2 >= x1 ? 1 : -1;
    const sx = x1 + dir * RADIUS;
    const ex = x2 - dir * RADIUS;
    const k = Math.max(12, Math.abs(ex - sx) * 0.5);
    return `M${round(sx)} ${round(y1)} C${round(sx + dir * k)} ${round(y1)} ${round(ex - dir * k)} ${round(y2)} ${round(ex)} ${round(y2)}`;
  }
  const sy = y1 + RADIUS;
  const ey = y2 - RADIUS;
  if (channelX === undefined) {
    const k = Math.max(28, (ey - sy) * 0.5);
    return `M${round(x1)} ${round(sy)} C${round(x1)} ${round(sy + k)} ${round(x2)} ${round(ey - k)} ${round(x2)} ${round(ey)}`;
  }
  const bend = 46;
  const c = round(channelX);
  return `M${round(x1)} ${round(sy)} C${round(x1)} ${round(sy + bend)} ${c} ${round(sy + 8)} ${c} ${round(sy + bend + 8)} L${c} ${round(ey - bend - 8)} C${c} ${round(ey - 8)} ${round(x2)} ${round(ey - bend)} ${round(x2)} ${round(ey)}`;
}

/** Pure placement: trail columns (wide) or stacked trails (narrow), one row per day, 1-2 nodes per row. */
export function graphLayout(nodes: LayoutInput[], mode: GraphMode, containerWidth: number): GraphLayout {
  const width = Math.max(MIN_WIDTH, Math.round(containerWidth));
  const trailIds = [...new Set(nodes.map((n) => n.trail))].sort((a, b) => a - b);
  const columns = mode === 'wide' ? Math.max(1, trailIds.length) : 1;
  const columnWidth = (width - COLUMN_GAP * (columns - 1)) / columns;
  const labelWidth = Math.floor(Math.min(148, columnWidth / 2 - 10));

  const placed = new Map<string, LayoutNode>();
  const channelOf = new Map<number, number>();
  const trails: LayoutTrail[] = [];
  let height = 0;
  let stackTop = 0;

  trailIds.forEach((trail, index) => {
    const members = nodes.filter((n) => n.trail === trail);
    const days = [...new Set(members.map((n) => n.day))].sort((a, b) => a - b);
    const left = mode === 'wide' ? index * (columnWidth + COLUMN_GAP) : 0;
    const top = mode === 'wide' ? 0 : stackTop;
    trails.push({ trail, x: left, y: top, width: columnWidth });
    channelOf.set(trail, left + columnWidth / 2);
    days.forEach((day, row) => {
      const inRow = members.filter((n) => n.day === day);
      const cy = top + HEADER_HEIGHT + row * ROW_HEIGHT + RADIUS;
      inRow.forEach((n, i) => {
        const share = inRow.length === 1 ? (row === days.length - 1 ? 0.5 : 0.26) : i === 0 ? 0.26 : 0.74;
        placed.set(n.id, { id: n.id, x: round(left + columnWidth * share), y: cy });
      });
    });
    const bottom = top + HEADER_HEIGHT + days.length * ROW_HEIGHT;
    if (mode === 'wide') height = Math.max(height, bottom);
    else {
      stackTop = bottom + 8;
      height = bottom;
    }
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: LayoutEdge[] = [];
  for (const node of nodes) {
    const to = placed.get(node.id);
    if (!to) continue;
    for (const req of node.requires) {
      const from = placed.get(req);
      if (!from) continue;
      const crossTrail = byId.get(req)?.trail !== node.trail;
      const skipsRow = to.y - from.y > ROW_HEIGHT * 1.5;
      const channel = skipsRow && (mode === 'narrow' || !crossTrail) ? channelOf.get(node.trail) : undefined;
      edges.push({ from: req, to: node.id, path: edgePath(from.x, from.y, to.x, to.y, channel), crossTrail });
    }
  }

  return { width, height, radius: RADIUS, labelWidth, labelHeight: LABEL_HEIGHT, nodes: [...placed.values()], edges, trails };
}
