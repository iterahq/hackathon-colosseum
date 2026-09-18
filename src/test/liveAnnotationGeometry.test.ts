import { describe, expect, it } from 'vitest';

import {
  annotationPath,
  annotationPoint,
  annotationTransform,
} from '@/utils/liveAnnotationGeometry';

describe('annotationTransform', () => {
  it('não distorce quando as duas superfícies têm a mesma proporção', () => {
    const t = annotationTransform(800, 600, 1600, 1200);
    expect(t.scale).toBe(2);
    expect(t.dx).toBe(0);
    expect(t.dy).toBe(0);
  });

  it('usa o MENOR fator nos dois eixos e centraliza a sobra', () => {
    const t = annotationTransform(800, 600, 1600, 600);
    expect(t.scale).toBe(1);
    expect(t.dx).toBe(400);
    expect(t.dy).toBe(0);
  });

  it('a letra continua sendo a mesma letra: um quadrado do emissor chega quadrado', () => {
    const t = annotationTransform(1000, 500, 600, 900);
    const a = annotationPoint(0.2, 0.4, 1000, 500, t);
    const b = annotationPoint(0.3, 0.6, 1000, 500, t);
    expect(b.x - a.x).toBeCloseTo(b.y - a.y, 6);
  });

  it('nada é cortado: os quatro cantos do emissor caem dentro do receptor', () => {
    const t = annotationTransform(1000, 500, 600, 900);
    for (const [nx, ny] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      const p = annotationPoint(nx, ny, 1000, 500, t);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(600);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(900);
    }
  });

  it('dimensão insana devolve identidade em vez de NaN no path', () => {
    for (const bad of [0, -10, Number.NaN, Number.POSITIVE_INFINITY, 99999]) {
      expect(annotationTransform(bad, 600, 800, 600)).toEqual({ scale: 1, dx: 0, dy: 0 });
    }
    const d = annotationPath([0, 0, 1, 1], 0, 600, annotationTransform(0, 600, 800, 600));
    expect(d).not.toContain('NaN');
  });
});

describe('annotationPath', () => {
  const identity = { scale: 1, dx: 0, dy: 0 };

  it('sem ponto nenhum não pinta nada', () => {
    expect(annotationPath([], 100, 100, identity)).toBe('');
  });

  it('um toque sem arrastar continua sendo um ponto desenhável', () => {
    const d = annotationPath([0.5, 0.5], 100, 100, identity);
    expect(d).toBe('M50,50l0.01,0');
  });

  it('suaviza pelos meios em vez de ligar vértice a vértice', () => {
    const d = annotationPath([0, 0, 0.5, 0, 0.5, 0.5, 1, 0.5], 100, 100, identity);
    expect(d.startsWith('M0,0')).toBe(true);
    expect(d).toContain('Q');
    expect(d.endsWith('L100,50')).toBe(true);
  });

  it('ponto ímpar sobrando não vira coordenada undefined', () => {
    const d = annotationPath([0, 0, 1, 1, 0.5], 100, 100, identity);
    expect(d).not.toContain('NaN');
    expect(d).not.toContain('undefined');
  });
});
