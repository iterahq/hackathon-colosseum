/**
 * Que traço a borracha encostou.
 *
 * ## Por que o teste é em PX de quem apaga, e não em normalizado
 *
 * Cada traço guarda os pontos normalizados pela superfície de QUEM DESENHOU, e o
 * professor pode ter redimensionado o painel entre desenhar e apagar. Comparar
 * normalizado contra normalizado erraria exatamente na proporção do letterbox.
 * Então cada traço passa pela mesma `annotationTransform` que a camada de render
 * usa: o alvo do teste é o pixel que está NA TELA, que é o que a mão do professor
 * está mirando.
 *
 * ## De trás para frente
 *
 * A varredura começa pelo fim da lista porque é essa a ordem de pintura: o traço
 * mais novo está por cima. Onde dois se cruzam, apagar o de baixo pareceria que a
 * borracha errou.
 */

import { annotationPoint, annotationTransform } from '@/utils/liveAnnotationGeometry';
import type { AnnotationStroke } from '@/types/liveAnnotation';

/**
 * Raio da ponta, em px de tela. Bem maior que a espessura do traço (3px) porque
 * o alvo é uma linha de 3px de largura e mira exata em linha fina é frustrante —
 * o professor está com a mão no ar explicando, não fazendo pixel art.
 */
export const ERASER_RADIUS_PX = 14;

/** Distância² do ponto ao SEGMENTO (não à reta) — sem `sqrt`, só se compara. */
function distanceSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  // Segmento degenerado (o traço de um toque só) ainda é alvo: vira ponto.
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

function touches(stroke: AnnotationStroke, x: number, y: number, w: number, h: number): boolean {
  const n = Math.floor(stroke.points.length / 2);
  if (n === 0) return false;
  const t = annotationTransform(stroke.fromW, stroke.fromH, w, h);
  const at = (i: number) =>
    annotationPoint(stroke.points[i * 2], stroke.points[i * 2 + 1], stroke.fromW, stroke.fromH, t);
  const limit = ERASER_RADIUS_PX * ERASER_RADIUS_PX;

  let prev = at(0);
  if (n === 1) return distanceSq(x, y, prev.x, prev.y, prev.x, prev.y) <= limit;
  for (let i = 1; i < n; i += 1) {
    const next = at(i);
    if (distanceSq(x, y, prev.x, prev.y, next.x, next.y) <= limit) return true;
    prev = next;
  }
  return false;
}

/**
 * O traço sob a ponta da borracha, ou `null`. UM por chamada, mesmo quando vários
 * se sobrepõem: apagar uma pilha inteira com um encostão é o tipo de perda que o
 * professor não consegue desfazer — não há histórico, e redesenhar no meio da
 * explicação custa a explicação.
 */
export function annotationAtPoint(
  strokes: readonly AnnotationStroke[],
  x: number,
  y: number,
  w: number,
  h: number
): AnnotationStroke | null {
  for (let i = strokes.length - 1; i >= 0; i -= 1) {
    if (touches(strokes[i], x, y, w, h)) return strokes[i];
  }
  return null;
}
