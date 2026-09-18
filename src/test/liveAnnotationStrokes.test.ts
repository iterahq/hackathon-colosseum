import { describe, expect, it } from 'vitest';

import type { AnnotationFrame } from '@/types/liveAnnotation';
import {
  ANNOTATION_FADE_MS,
  ANNOTATION_HOLD_MS,
  annotationOpacity,
  applyAnnotationFrame,
  pruneAnnotations,
} from '@/utils/liveAnnotationStrokes';

const frame = (over: Partial<AnnotationFrame> = {}): AnnotationFrame => ({
  userId: 'prof',
  strokeId: 's1',
  color: 'menta',
  points: [0.1, 0.1],
  fromW: 800,
  fromH: 600,
  seq: 1,
  ...over,
});

describe('applyAnnotationFrame', () => {
  it('o primeiro lote abre o traço', () => {
    const next = applyAnnotationFrame([], frame(), 1000);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ id: 's1', color: 'menta', done: false, seq: 1 });
  });

  it('os lotes seguintes emendam no mesmo traço', () => {
    let s = applyAnnotationFrame([], frame(), 1000);
    s = applyAnnotationFrame(s, frame({ seq: 2, points: [0.2, 0.2] }), 1100);
    expect(s).toHaveLength(1);
    expect(s[0].points).toEqual([0.1, 0.1, 0.2, 0.2]);
  });

  it('lote repetido ou atrasado é descartado sem repintar', () => {
    const s = applyAnnotationFrame([], frame({ seq: 5 }), 1000);
    expect(applyAnnotationFrame(s, frame({ seq: 5, points: [0.9, 0.9] }), 1100)).toBe(s);
    expect(applyAnnotationFrame(s, frame({ seq: 2, points: [0.9, 0.9] }), 1100)).toBe(s);
  });

  it('salto de seq segue em frente: o buraco some junto com o traço', () => {
    let s = applyAnnotationFrame([], frame({ seq: 1 }), 1000);
    s = applyAnnotationFrame(s, frame({ seq: 9, points: [0.8, 0.8] }), 1100);
    expect(s[0].seq).toBe(9);
    expect(s[0].points).toEqual([0.1, 0.1, 0.8, 0.8]);
  });

  it('done gruda: um lote atrasado não ressuscita a caneta', () => {
    let s = applyAnnotationFrame([], frame({ seq: 1 }), 1000);
    s = applyAnnotationFrame(s, frame({ seq: 2, done: true }), 1100);
    s = applyAnnotationFrame(s, frame({ seq: 3 }), 1200);
    expect(s[0].done).toBe(true);
  });

  it('ponto fora de 0..1 é grampeado, e ponto insano corta o lote', () => {
    const s = applyAnnotationFrame([], frame({ points: [-3, 4, Number.NaN, 0.5] }), 1000);
    expect(s[0].points).toEqual([0, 1]);
  });

  it('traços demais na tela: os mais velhos saem', () => {
    let s: readonly ReturnType<typeof applyAnnotationFrame>[number][] = [];
    for (let i = 0; i < 40; i += 1) s = applyAnnotationFrame(s, frame({ strokeId: `s${i}` }), 1000);
    expect(s.length).toBeLessThanOrEqual(24);
    expect(s[s.length - 1].id).toBe('s39');
  });

  it('emissor sem freio não trava a aba do aluno', () => {
    let s = applyAnnotationFrame([], frame({ seq: 1 }), 1000);
    for (let i = 2; i < 200; i += 1) {
      s = applyAnnotationFrame(s, frame({ seq: i, points: new Array(100).fill(0.5) }), 1000 + i);
    }
    expect(s[0].points.length).toBeLessThanOrEqual(4000);
  });
});

describe('sumiço', () => {
  const done = applyAnnotationFrame([], frame({ done: true }), 0);

  it('enquanto a caneta está no papel o traço fica cheio', () => {
    const drawing = applyAnnotationFrame([], frame(), 0);
    expect(annotationOpacity(drawing[0], ANNOTATION_HOLD_MS * 10)).toBe(1);
  });

  it('o relógio conta do done, e só depois do HOLD começa a esmaecer', () => {
    expect(annotationOpacity(done[0], ANNOTATION_HOLD_MS)).toBe(1);
    expect(annotationOpacity(done[0], ANNOTATION_HOLD_MS + ANNOTATION_FADE_MS / 2)).toBeCloseTo(
      0.5,
      6
    );
    expect(annotationOpacity(done[0], ANNOTATION_HOLD_MS + ANNOTATION_FADE_MS)).toBe(0);
  });

  it('prune tira o que já sumiu e devolve a mesma lista quando não há o que tirar', () => {
    expect(pruneAnnotations(done, 0)).toBe(done);
    expect(pruneAnnotations(done, ANNOTATION_HOLD_MS + ANNOTATION_FADE_MS)).toHaveLength(0);
  });
});
