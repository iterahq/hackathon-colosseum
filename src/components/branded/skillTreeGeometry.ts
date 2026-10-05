export const WAVE_OFFSETS = [0, -1, -2, -1, 0, 1, 2, 1];
export const MAX_TRAIL_WIDTH = 480;
export const NODE_SIZE = 68;
export const CURRENT_SIZE = 84;
export const LABEL_HEIGHT = 66;
export const PRIMARY_LABEL_HEIGHT = 44;
export const CALLOUT_HEIGHT = 172;
export const BANNER_HEIGHT = 92;
export const BANNER_INSET = 12;
export const WIDE_TRAIL_MIN_WIDTH = 860;
export const WIDE_BANNER_WIDTH = 560;

const TOP_PADDING = 20;
const BANNER_GAP = 34;
const NODE_HALO = 12;
const NODE_GAP = 14;
const SECTION_GAP = 26;
const BOTTOM_PADDING = 24;
const CALLOUT_GAP = 14;
const WIDE_MARGIN = 160;
const WIDE_MIN_SPACING = 220;
const WIDE_WAVE = 22;
const WIDE_WAVE_STEPS = [0, 1, 0, -1];
const WIDE_ROW_GAP = 40;
const HAIRPIN_BULGE = 110;

export interface TrailPoint {
  x: number;
  y: number;
}

export interface TrailNodePlacement extends TrailPoint {
  size: number;
  day: number;
  sectionIndex: number;
  indexInSection: number;
  globalIndex: number;
  row?: number;
  direction?: 1 | -1;
}

export interface TrailBannerPlacement {
  y: number;
  height: number;
}

export interface TrailLayout {
  width: number;
  height: number;
  banners: TrailBannerPlacement[];
  nodes: TrailNodePlacement[];
  calloutTop: number | null;
}

export function trailWidthFor(containerWidth: number): number {
  return Math.max(0, Math.min(containerWidth, MAX_TRAIL_WIDTH));
}

export function isWideTrail(containerWidth: number): boolean {
  return containerWidth >= WIDE_TRAIL_MIN_WIDTH;
}

export function wideBannerInset(width: number): number {
  return Math.max(BANNER_INSET, (width - WIDE_BANNER_WIDTH) / 2);
}

export function waveAmplitude(width: number): number {
  return Math.max(0, Math.min(56, (width - 2 * (CURRENT_SIZE / 2 + 36)) / 4));
}

export function computeTrailLayout({
  width,
  sectionSizes,
  primaryIndex,
}: {
  width: number;
  sectionSizes: number[];
  primaryIndex: number | null;
}): TrailLayout {
  const amplitude = waveAmplitude(width);
  const banners: TrailBannerPlacement[] = [];
  const nodes: TrailNodePlacement[] = [];
  let calloutTop: number | null = null;
  let cursor = TOP_PADDING;
  let globalIndex = 0;

  sectionSizes.forEach((count, sectionIndex) => {
    banners.push({ y: cursor, height: BANNER_HEIGHT });
    cursor += BANNER_HEIGHT + BANNER_GAP;
    for (let i = 0; i < count; i++) {
      const isPrimary = globalIndex === primaryIndex;
      const size = isPrimary ? CURRENT_SIZE : NODE_SIZE;
      const top = cursor + NODE_HALO;
      const y = top + size / 2;
      const offset = WAVE_OFFSETS[globalIndex % WAVE_OFFSETS.length];
      nodes.push({
        x: width / 2 + offset * amplitude,
        y,
        size,
        day: globalIndex + 1,
        sectionIndex,
        indexInSection: i,
        globalIndex,
      });
      if (isPrimary) {
        calloutTop = top + size + NODE_HALO + PRIMARY_LABEL_HEIGHT;
        cursor = calloutTop + CALLOUT_HEIGHT + CALLOUT_GAP + NODE_GAP;
      } else {
        cursor = top + size + NODE_HALO + LABEL_HEIGHT + NODE_GAP;
      }
      globalIndex++;
    }
    cursor += SECTION_GAP;
  });

  return { width, height: cursor + BOTTOM_PADDING, banners, nodes, calloutTop };
}

export function computeWideTrailLayout({
  width,
  sectionSizes,
  primaryIndex,
}: {
  width: number;
  sectionSizes: number[];
  primaryIndex: number | null;
}): TrailLayout {
  const span = width - 2 * WIDE_MARGIN;
  const perRow = Math.max(2, Math.floor(span / WIDE_MIN_SPACING) + 1);
  const banners: TrailBannerPlacement[] = [];
  const nodes: TrailNodePlacement[] = [];
  let calloutTop: number | null = null;
  let cursor = TOP_PADDING;
  let globalIndex = 0;
  let row = 0;
  let direction: 1 | -1 = 1;

  sectionSizes.forEach((count, sectionIndex) => {
    banners.push({ y: cursor, height: BANNER_HEIGHT });
    cursor += BANNER_HEIGHT + BANNER_GAP;
    const rows = Math.ceil(count / perRow);
    const baseColumns = Math.floor(count / Math.max(1, rows));
    let rowStart = 0;
    for (let r = 0; r < rows; r++) {
      const columns = baseColumns + (r < count % rows ? 1 : 0);
      // A row of one stays on the edge the path is on and does not turn it
      // around: centred, the path cut across the banners above and below it.
      const alone = columns === 1;
      const spacing = columns > 1 ? span / (columns - 1) : 0;
      const centerline = cursor + NODE_HALO + WIDE_WAVE + CURRENT_SIZE / 2;
      let rowBottom = cursor;
      for (let i = rowStart; i < rowStart + columns; i++) {
        const column = i - rowStart;
        const isPrimary = globalIndex === primaryIndex;
        const size = isPrimary ? CURRENT_SIZE : NODE_SIZE;
        const edge = direction === 1 ? WIDE_MARGIN : width - WIDE_MARGIN;
        const y = centerline + WIDE_WAVE_STEPS[column % WIDE_WAVE_STEPS.length] * WIDE_WAVE;
        nodes.push({
          x: edge + direction * column * spacing,
          y,
          size,
          day: globalIndex + 1,
          sectionIndex,
          indexInSection: i,
          globalIndex,
          row,
          direction: alone ? (direction === 1 ? -1 : 1) : direction,
        });
        const below = y + size / 2 + NODE_HALO;
        if (isPrimary) {
          calloutTop = below + PRIMARY_LABEL_HEIGHT;
          rowBottom = Math.max(rowBottom, calloutTop + CALLOUT_HEIGHT + CALLOUT_GAP);
        } else {
          rowBottom = Math.max(rowBottom, below + LABEL_HEIGHT);
        }
        globalIndex++;
      }
      rowStart += columns;
      cursor = rowBottom + WIDE_ROW_GAP;
      if (!alone) direction = direction === 1 ? -1 : 1;
      row++;
    }
    cursor += SECTION_GAP;
  });

  return { width, height: cursor + BOTTOM_PADDING, banners, nodes, calloutTop };
}

const fmt = (n: number) => Math.round(n * 100) / 100;

export function segmentPath(a: TrailPoint, b: TrailPoint): string {
  const mid = (b.y - a.y) / 2;
  return `C${fmt(a.x)},${fmt(a.y + mid)} ${fmt(b.x)},${fmt(b.y - mid)} ${fmt(b.x)},${fmt(b.y)}`;
}

export function buildTrailPath(points: TrailPoint[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  let d = `M${fmt(first.x)},${fmt(first.y)}`;
  let prev = first;
  for (const p of rest) {
    d += ` ${segmentPath(prev, p)}`;
    prev = p;
  }
  return d;
}

export function wideSegmentPath(a: TrailNodePlacement, b: TrailNodePlacement): string {
  if (a.row === b.row) {
    const mid = (b.x - a.x) / 2;
    return `C${fmt(a.x + mid)},${fmt(a.y)} ${fmt(b.x - mid)},${fmt(b.y)} ${fmt(b.x)},${fmt(b.y)}`;
  }
  const bulge = (a.direction ?? 1) * HAIRPIN_BULGE;
  return `C${fmt(a.x + bulge)},${fmt(a.y)} ${fmt(b.x + bulge)},${fmt(b.y)} ${fmt(b.x)},${fmt(b.y)}`;
}

export function buildWideTrailPath(nodes: TrailNodePlacement[]): string {
  if (nodes.length === 0) return '';
  const [first, ...rest] = nodes;
  let d = `M${fmt(first.x)},${fmt(first.y)}`;
  let prev = first;
  for (const node of rest) {
    d += ` ${wideSegmentPath(prev, node)}`;
    prev = node;
  }
  return d;
}
