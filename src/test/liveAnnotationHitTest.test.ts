import { describe, it, expect } from 'vitest';
import { ERASER_RADIUS_PX, annotationAtPoint } from '@/utils/liveAnnotationHitTest';
import { eraseStrokes } from '@/utils/liveAnnotationStrokes';
import type { AnnotationStroke } from '@/types/liveAnnotation';

/**
 * A mira da borracha.
 *
 * O que estes testes travam é que a mira segue a MESMA geometria do render. Um
 * teste de acerto em coordenada normalizada passaria em superfície quadrada e
 * erraria exatamente onde o letterbox aparece — que é o caso real, porque o
 * painel do professor e o do aluno raramente têm a mesma proporção.
 */

const stroke = (over: Partial<AnnotationStroke> = {}): AnnotationStroke => ({
  id: 's1',
  color: 'menta',
  points: [0.25, 0.5, 0.75, 0.5],
  fromW: 400,
  fromH: 200,
  done: false,
  seq: 1,
  touchedAt: 0,
  ...over,
});

describe('annotationAtPoint', () => {
  it('acerta em cima do traço e erra longe dele', () => {
    const list = [stroke()];
    expect(annotationAtPoint(list, 200, 100, 400, 200)?.id).toBe('s1');
    expect(annotationAtPoint(list, 200, 190, 400, 200)).toBeNull();
  });

  it('a ponta é mais grossa que o traço, senão mirar linha de 3px frustra', () => {
    const list = [stroke()];
    const near = 100 + ERASER_RADIUS_PX - 2;
    const far = 100 + ERASER_RADIUS_PX + 4;
    expect(annotationAtPoint(list, 200, near, 400, 200)?.id).toBe('s1');
    expect(annotationAtPoint(list, 200, far, 400, 200)).toBeNull();
  });

  it('mede no PIXEL de quem apaga, com o mesmo letterbox do render', () => {
    // Traço 400×200 dentro de uma superfície 400×400: escala 1, faixa de 100px
    // em cima e embaixo. O meio do traço cai em y=200, não em y=100.
    const list = [stroke()];
    expect(annotationAtPoint(list, 200, 200, 400, 400)?.id).toBe('s1');
    expect(annotationAtPoint(list, 200, 100, 400, 400)).toBeNull();
  });

  it('onde dois se cruzam, ganha o de cima — o mais novo', () => {
    const list = [stroke({ id: 'velho' }), stroke({ id: 'novo' })];
    expect(annotationAtPoint(list, 200, 100, 400, 200)?.id).toBe('novo');
  });

  it('um toque sem arrasto também é alvo', () => {
    const list = [stroke({ points: [0.5, 0.5] })];
    expect(annotationAtPoint(list, 200, 100, 400, 200)?.id).toBe('s1');
  });

  it('traço vazio nunca é alvo, e lista vazia devolve null', () => {
    expect(annotationAtPoint([stroke({ points: [] })], 200, 100, 400, 200)).toBeNull();
    expect(annotationAtPoint([], 200, 100, 400, 200)).toBeNull();
  });

  it('só o segmento conta, não a reta que o prolonga', () => {
    const list = [stroke()];
    // A reta do traço passa por y=100 em toda a largura; o segmento acaba em x=300.
    expect(annotationAtPoint(list, 380, 100, 400, 200)).toBeNull();
  });
});

describe('eraseStrokes', () => {
  it('tira os ids pedidos e devolve a MESMA lista quando nenhum bate', () => {
    const list = [stroke({ id: 'a' }), stroke({ id: 'b' })];
    expect(eraseStrokes(list, ['a']).map((s) => s.id)).toEqual(['b']);
    expect(eraseStrokes(list, [])).toBe(list);
    expect(eraseStrokes(list, ['sumiu-sozinho'])).toBe(list);
  });
});
