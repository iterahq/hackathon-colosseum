import { describe, it, expect } from 'vitest';
import {
  CURRENT_SIZE,
  LABEL_HEIGHT,
  MAX_TRAIL_WIDTH,
  NODE_SIZE,
  WIDE_TRAIL_MIN_WIDTH,
  buildTrailPath,
  buildWideTrailPath,
  computeTrailLayout,
  computeWideTrailLayout,
  isWideTrail,
  segmentPath,
  trailWidthFor,
  waveAmplitude,
  wideBannerInset,
  wideSegmentPath,
} from './skillTreeGeometry';

describe('skillTreeGeometry', () => {
  it('caps the trail width and never goes negative', () => {
    expect(trailWidthFor(1100)).toBe(MAX_TRAIL_WIDTH);
    expect(trailWidthFor(360)).toBe(360);
    expect(trailWidthFor(0)).toBe(0);
  });

  it('keeps the widest wave offset inside the container on narrow screens', () => {
    for (const width of [320, 360, 390, 480]) {
      const layout = computeTrailLayout({ width, sectionSizes: [8], primaryIndex: null });
      for (const node of layout.nodes) {
        expect(node.x - node.size / 2).toBeGreaterThanOrEqual(0);
        expect(node.x + node.size / 2).toBeLessThanOrEqual(width);
      }
      expect(waveAmplitude(width)).toBeLessThanOrEqual(56);
    }
  });

  it('numbers days continuously across sections and places banners above their nodes', () => {
    const layout = computeTrailLayout({ width: 390, sectionSizes: [2, 3], primaryIndex: null });
    expect(layout.nodes.map((n) => n.day)).toEqual([1, 2, 3, 4, 5]);
    expect(layout.nodes.map((n) => n.sectionIndex)).toEqual([0, 0, 1, 1, 1]);
    expect(layout.banners[0].y).toBeLessThan(layout.nodes[0].y);
    expect(layout.banners[1].y).toBeGreaterThan(layout.nodes[1].y);
    expect(layout.banners[1].y + layout.banners[1].height).toBeLessThan(layout.nodes[2].y);
  });

  it('enlarges the primary node and reserves room for its callout', () => {
    const plain = computeTrailLayout({ width: 390, sectionSizes: [4], primaryIndex: null });
    const withCallout = computeTrailLayout({ width: 390, sectionSizes: [4], primaryIndex: 1 });
    expect(plain.nodes[1].size).toBe(NODE_SIZE);
    expect(withCallout.nodes[1].size).toBe(CURRENT_SIZE);
    expect(withCallout.calloutTop).not.toBeNull();
    expect(withCallout.calloutTop!).toBeGreaterThan(withCallout.nodes[1].y);
    expect(withCallout.nodes[2].y).toBeGreaterThan(withCallout.calloutTop! + 150);
    expect(withCallout.height).toBeGreaterThan(plain.height);
  });

  it('pulls the callout up under the primary node, whose label drops its title', () => {
    const layout = computeTrailLayout({ width: 390, sectionSizes: [4], primaryIndex: 1 });
    const nodeBottom = layout.nodes[1].y + CURRENT_SIZE / 2;
    expect(layout.calloutTop! - nodeBottom).toBeLessThan(LABEL_HEIGHT);
  });

  it('builds a continuous cubic path that passes through every node center', () => {
    const layout = computeTrailLayout({ width: 390, sectionSizes: [3], primaryIndex: null });
    const d = buildTrailPath(layout.nodes);
    expect(d.startsWith(`M${layout.nodes[0].x},${layout.nodes[0].y}`)).toBe(true);
    expect(d.match(/C/g)).toHaveLength(2);
    expect(d.endsWith(`${layout.nodes[2].x},${layout.nodes[2].y}`)).toBe(true);
    expect(buildTrailPath([])).toBe('');
  });

  it('uses vertical tangents at both ends of a segment', () => {
    expect(segmentPath({ x: 0, y: 0 }, { x: 100, y: 200 })).toBe('C0,100 100,100 100,200');
  });

  describe('wide trail', () => {
    it('switches to the wide layout only from the desktop threshold up', () => {
      expect(isWideTrail(WIDE_TRAIL_MIN_WIDTH - 1)).toBe(false);
      expect(isWideTrail(WIDE_TRAIL_MIN_WIDTH)).toBe(true);
    });

    it('spreads a week across the full width instead of a centered column', () => {
      for (const width of [860, 1280, 1840, 3000]) {
        const layout = computeWideTrailLayout({ width, sectionSizes: [5], primaryIndex: null });
        const xs = layout.nodes.filter((n) => n.row === 0).map((n) => n.x);
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(width * 0.6);
        for (const node of layout.nodes) {
          expect(node.x - 148 / 2).toBeGreaterThanOrEqual(0);
          expect(node.x + 148 / 2).toBeLessThanOrEqual(width);
        }
      }
    });

    it('snakes: each row starts on the side where the previous one ended', () => {
      const layout = computeWideTrailLayout({ width: 860, sectionSizes: [6], primaryIndex: null });
      const rows = [0, 1].map((r) => layout.nodes.filter((n) => n.row === r));
      expect(rows[0].length).toBe(3);
      expect(rows[0][0].x).toBeLessThan(rows[0][2].x);
      expect(rows[1][0].x).toBe(rows[0][2].x);
      expect(rows[1][2].x).toBe(rows[0][0].x);
      expect(rows[1][0].y).toBeGreaterThan(rows[0][2].y);
    });

    it('balances a week that does not fit one row so every row ends on an edge', () => {
      const layout = computeWideTrailLayout({ width: 1168, sectionSizes: [5, 5], primaryIndex: null });
      const sizes = [0, 1, 2, 3].map((r) => layout.nodes.filter((n) => n.row === r).length);
      expect(sizes).toEqual([3, 2, 3, 2]);
      const xs = layout.nodes.map((n) => n.x);
      expect(xs[3]).toBe(xs[2]);
      expect(xs[5]).toBe(xs[4]);
    });

    it('keeps neighbours clear of the primary callout and reserves its height', () => {
      const plain = computeWideTrailLayout({ width: 1280, sectionSizes: [5, 5], primaryIndex: null });
      const layout = computeWideTrailLayout({ width: 1280, sectionSizes: [5, 5], primaryIndex: 0 });
      expect(layout.nodes[0].size).toBe(CURRENT_SIZE);
      expect(layout.nodes[1].x - layout.nodes[0].x).toBeGreaterThanOrEqual(280 / 2 + 148 / 2);
      expect(layout.nodes[0].x - 280 / 2).toBeGreaterThanOrEqual(12);
      expect(layout.banners[1].y).toBeGreaterThan(layout.calloutTop! + 172);
      expect(layout.height).toBeGreaterThan(plain.height);
    });

    it('keeps days and sections continuous', () => {
      const layout = computeWideTrailLayout({ width: 1000, sectionSizes: [1, 3], primaryIndex: null });
      expect(layout.nodes.map((n) => n.day)).toEqual([1, 2, 3, 4]);
      expect(layout.banners[1].y).toBeGreaterThan(layout.nodes[0].y);
    });

    it('keeps a single-lesson week on the edge the path is on, so no segment crosses a banner', () => {
      const width = 1360;
      const layout = computeWideTrailLayout({ width, sectionSizes: [5, 1, 5, 1, 1, 4], primaryIndex: null });
      const inset = wideBannerInset(width);
      for (let i = 1; i < layout.nodes.length; i++) {
        const [a, b] = [layout.nodes[i - 1], layout.nodes[i]];
        if (a.row === b.row) continue;
        expect(b.x).toBe(a.x);
        const onLeft = a.x < width / 2;
        expect(onLeft ? a.x : width - a.x).toBeLessThan(inset);
        expect(wideSegmentPath(a, b)).toContain(`C${a.x + (onLeft ? -110 : 110)},`);
      }
      expect(layout.nodes[5].x).toBe(layout.nodes[4].x);
      expect(layout.nodes[6].x).toBe(layout.nodes[5].x);
    });

    it('draws one continuous path through every node', () => {
      const layout = computeWideTrailLayout({ width: 860, sectionSizes: [6], primaryIndex: null });
      const d = buildWideTrailPath(layout.nodes);
      expect(d.startsWith(`M${layout.nodes[0].x},${layout.nodes[0].y}`)).toBe(true);
      expect(d.match(/C/g)).toHaveLength(5);
      expect(buildWideTrailPath([])).toBe('');
    });
  });
});
