import { describe, expect, it } from 'vitest';
import { graphLayout, type LayoutInput } from '@/components/graph/graphLayout';

const nodes: LayoutInput[] = [
  { id: 'a', trail: 0, day: 1, requires: [] },
  { id: 'b', trail: 0, day: 1, requires: ['a'] },
  { id: 'c', trail: 0, day: 2, requires: ['b'] },
  { id: 'd', trail: 1, day: 1, requires: ['a'] },
  { id: 'e', trail: 1, day: 2, requires: ['d', 'c'] },
  { id: 'f', trail: 2, day: 1, requires: ['ghost'] },
];

const at = (l: ReturnType<typeof graphLayout>, id: string) => l.nodes.find((n) => n.id === id)!;

describe('graphLayout', () => {
  it('wide: one column per trail, days as rows, two nodes side by side', () => {
    const l = graphLayout(nodes, 'wide', 900);
    expect(l.width).toBe(900);
    expect(at(l, 'a').y).toBe(at(l, 'b').y);
    expect(at(l, 'a').x).toBeLessThan(at(l, 'b').x);
    expect(at(l, 'c').y).toBeGreaterThan(at(l, 'a').y);
    expect(at(l, 'd').x).toBeGreaterThan(at(l, 'b').x);
    expect(at(l, 'd').y).toBe(at(l, 'a').y);
    expect(l.trails).toHaveLength(3);
    expect(l.trails[1].x).toBeGreaterThan(l.trails[0].x);
  });

  it('narrow: trails stack vertically and everything stays inside the width', () => {
    const l = graphLayout(nodes, 'narrow', 343);
    expect(at(l, 'd').y).toBeGreaterThan(at(l, 'c').y);
    expect(at(l, 'f').y).toBeGreaterThan(at(l, 'e').y);
    for (const n of l.nodes) {
      expect(n.x - l.labelWidth / 2).toBeGreaterThanOrEqual(0);
      expect(n.x + l.labelWidth / 2).toBeLessThanOrEqual(l.width);
    }
    expect(l.height).toBeGreaterThan(at(l, 'f').y);
  });

  it('wide: labels never overflow the container either', () => {
    const l = graphLayout(nodes, 'wide', 860);
    for (const n of l.nodes) {
      expect(n.x - l.labelWidth / 2).toBeGreaterThanOrEqual(0);
      expect(n.x + l.labelWidth / 2).toBeLessThanOrEqual(l.width);
    }
  });

  it('emits one edge per known prerequisite and flags cross-trail ones', () => {
    const l = graphLayout(nodes, 'wide', 900);
    expect(l.edges.map((e) => `${e.from}>${e.to}`).sort()).toEqual(['a>b', 'a>d', 'b>c', 'c>e', 'd>e']);
    expect(l.edges.find((e) => e.from === 'c' && e.to === 'e')?.crossTrail).toBe(true);
    expect(l.edges.find((e) => e.from === 'a' && e.to === 'b')?.crossTrail).toBe(false);
    expect(l.edges.every((e) => e.path.startsWith('M'))).toBe(true);
  });

  it('is deterministic and tolerates an empty graph and tiny widths', () => {
    expect(graphLayout(nodes, 'narrow', 343)).toEqual(graphLayout(nodes, 'narrow', 343));
    expect(graphLayout([], 'wide', 900).nodes).toEqual([]);
    expect(graphLayout(nodes, 'narrow', 100).width).toBeGreaterThanOrEqual(280);
  });

  it('routes an edge that skips a row through the free centre channel', () => {
    const chain = [
      { id: 'p', trail: 0, day: 1, requires: [] },
      { id: 'q', trail: 0, day: 2, requires: ['p'] },
      { id: 'r', trail: 0, day: 3, requires: ['p'] },
    ];
    const l = graphLayout(chain, 'narrow', 360);
    expect(l.edges.find((e) => e.to === 'r')?.path).toContain('L180 ');
    expect(l.edges.find((e) => e.to === 'q')?.path).not.toContain('L');
    expect(l.nodes.find((n) => n.id === 'q')?.x).toBeLessThan(180);
    expect(l.nodes.find((n) => n.id === 'r')?.x).toBe(180);
  });
});
