export const WAVE_OFFSETS = [0, -1, -2, -1, 0, 1, 2, 1];
export const MAX_TRAIL_WIDTH = 480;
export const NODE_SIZE = 68;
export const CURRENT_SIZE = 84;
export const LABEL_HEIGHT = 66;
export const CALLOUT_HEIGHT = 172;
export const BANNER_HEIGHT = 92;
export const BANNER_INSET = 12;

const TOP_PADDING = 20;
const BANNER_GAP = 34;
const NODE_HALO = 12;
const NODE_GAP = 14;
const SECTION_GAP = 26;
const BOTTOM_PADDING = 24;
const CALLOUT_GAP = 14;

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
      cursor = top + size + NODE_HALO + LABEL_HEIGHT + NODE_GAP;
      if (isPrimary) {
        calloutTop = top + size + NODE_HALO + LABEL_HEIGHT;
        cursor += CALLOUT_HEIGHT + CALLOUT_GAP;
      }
      globalIndex++;
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
