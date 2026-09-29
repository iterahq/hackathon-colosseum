import { describe, it, expect } from 'vitest';
import {
  CURRENT_SIZE,
  MAX_TRAIL_WIDTH,
  NODE_SIZE,
  buildTrailPath,
  computeTrailLayout,
  segmentPath,
  trailWidthFor,
  waveAmplitude,
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
});
