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

export function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  if (y2 - y1 >= RADIUS * 2) {
    const k = Math.max(40, (y2 - y1) * 0.5);
    return `M${round(x1)} ${round(y1)} C${round(x1)} ${round(y1 + k)} ${round(x2)} ${round(y2 - k)} ${round(x2)} ${round(y2)}`;
  }
  const k = Math.max(48, Math.abs(x2 - x1) * 0.5);
  const dir = x2 >= x1 ? 1 : -1;
  return `M${round(x1)} ${round(y1)} C${round(x1 + dir * k)} ${round(y1)} ${round(x2 - dir * k)} ${round(y2)} ${round(x2)} ${round(y2)}`;
}

/** Pure placement: trail columns (wide) or stacked trails (narrow), one row per day, 1-2 nodes per row. */
export function graphLayout(nodes: LayoutInput[], mode: GraphMode, containerWidth: number): GraphLayout {
  const width = Math.max(MIN_WIDTH, Math.round(containerWidth));
  const trailIds = [...new Set(nodes.map((n) => n.trail))].sort((a, b) => a - b);
  const columns = mode === 'wide' ? Math.max(1, trailIds.length) : 1;
  const columnWidth = (width - COLUMN_GAP * (columns - 1)) / columns;
  const labelWidth = Math.floor(Math.min(148, columnWidth / 2 - 10));

  const placed = new Map<string, LayoutNode>();
  const trails: LayoutTrail[] = [];
  let height = 0;
  let stackTop = 0;

  trailIds.forEach((trail, index) => {
    const members = nodes.filter((n) => n.trail === trail);
    const days = [...new Set(members.map((n) => n.day))].sort((a, b) => a - b);
    const left = mode === 'wide' ? index * (columnWidth + COLUMN_GAP) : 0;
    const top = mode === 'wide' ? 0 : stackTop;
    trails.push({ trail, x: left, y: top, width: columnWidth });
    days.forEach((day, row) => {
      const inRow = members.filter((n) => n.day === day);
      const cy = top + HEADER_HEIGHT + row * ROW_HEIGHT + RADIUS;
      inRow.forEach((n, i) => {
        const share = inRow.length === 1 ? 0.5 : i === 0 ? 0.26 : 0.74;
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
      edges.push({ from: req, to: node.id, path: edgePath(from.x, from.y, to.x, to.y), crossTrail: byId.get(req)?.trail !== node.trail });
    }
  }

  return { width, height, radius: RADIUS, labelWidth, labelHeight: LABEL_HEIGHT, nodes: [...placed.values()], edges, trails };
}
