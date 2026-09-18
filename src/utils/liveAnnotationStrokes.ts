/**
 * A memória curta do desenho: montar traço a partir de lotes, e esquecer.
 *
 * Tudo aqui é função pura sobre uma lista. Quem recebe não guarda nada além do
 * que ainda está na tela, e "ainda está na tela" é uma conta de relógio, não um
 * evento — por isso não existe `removeStroke`: o traço sai porque o tempo passou.
 *
 * ## Por que o relógio só começa no `done`
 *
 * O sumiço conta a partir de quando o professor LEVANTA a caneta, não de quando
 * o traço começou. Escrever uma frase à mão leva mais que o tempo de sumiço: se
 * o relógio contasse do primeiro ponto, a primeira letra apagaria antes de a
 * última ser escrita, e o aluno nunca leria a frase inteira.
 */

import {
  ANNOTATION_COLORS,
  type AnnotationColor,
  type AnnotationFrame,
  type AnnotationStroke,
} from '@/types/liveAnnotation';

/** Cor vinda do fio. Fora da paleta é descartado, não normalizado para um padrão:
 * um traço na cor errada confunde mais do que um traço que não aparece. */
export function isAnnotationColor(v: unknown): v is AnnotationColor {
  return typeof v === 'string' && (ANNOTATION_COLORS as readonly string[]).includes(v);
}

/** Tempo cheio depois que a caneta levanta. */
export const ANNOTATION_HOLD_MS = 7000;
/** Esmaecimento depois do `HOLD`. Junto dá ~8,5s de vida útil. */
export const ANNOTATION_FADE_MS = 1500;

/**
 * Tetos de memória. Não é paranoia de tamanho de heap — é que quem recebe
 * confia num lote que veio pelo fio, e um emissor com bug (ou com má fé) que
 * mande pontos sem parar trava a aba do ALUNO. O corte é silencioso de
 * propósito: derrubar o traço inteiro por excesso deixaria a explicação pela
 * metade, e um traço truncado ainda comunica.
 */
const MAX_POINTS_PER_STROKE = 4000;
const MAX_STROKES = 24;

function clampPoints(points: readonly number[]): number[] {
  const even = points.length - (points.length % 2);
  const out: number[] = [];
  for (let i = 0; i < even; i += 1) {
    const v = points[i];
    if (!Number.isFinite(v)) return out;
    out.push(v < 0 ? 0 : v > 1 ? 1 : v);
  }
  return out;
}

/**
 * Aplica um lote. Devolve a MESMA lista quando nada muda, para o React não
 * repintar à toa em lote repetido — que é o caso comum de reenvio.
 *
 * `seq` fora de ordem é DESCARTADO em vez de reordenado: guardar lote futuro
 * esperando o atrasado é uma fila de reordenação, com o custo de estado e de
 * timeout que ela traz, para consertar um buraco que some sozinho em segundos.
 */
export function applyAnnotationFrame(
  strokes: readonly AnnotationStroke[],
  frame: AnnotationFrame,
  now: number
): readonly AnnotationStroke[] {
  const points = clampPoints(frame.points);
  const index = strokes.findIndex((s) => s.id === frame.strokeId);

  if (index < 0) {
    const fresh: AnnotationStroke = {
      id: frame.strokeId,
      color: frame.color,
      points: points.slice(0, MAX_POINTS_PER_STROKE),
      fromW: frame.fromW,
      fromH: frame.fromH,
      done: frame.done === true,
      seq: frame.seq,
      touchedAt: now,
    };
    const next = [...strokes, fresh];
    return next.length > MAX_STROKES ? next.slice(next.length - MAX_STROKES) : next;
  }

  const current = strokes[index];
  if (frame.seq <= current.seq) return strokes;

  const merged: AnnotationStroke = {
    ...current,
    points:
      current.points.length >= MAX_POINTS_PER_STROKE
        ? current.points
        : [...current.points, ...points].slice(0, MAX_POINTS_PER_STROKE),
    done: current.done || frame.done === true,
    seq: frame.seq,
    touchedAt: now,
  };
  const next = strokes.slice();
  next[index] = merged;
  return next;
}

/**
 * Quanto do traço ainda se vê. Enquanto a caneta está no papel o traço fica
 * cheio, mesmo que a mão pare no meio do gesto — o relógio é do `done`.
 */
export function annotationOpacity(stroke: AnnotationStroke, now: number): number {
  if (!stroke.done) return 1;
  const age = now - stroke.touchedAt;
  if (age <= ANNOTATION_HOLD_MS) return 1;
  const faded = (age - ANNOTATION_HOLD_MS) / ANNOTATION_FADE_MS;
  return faded >= 1 ? 0 : 1 - faded;
}

/**
 * Tira os traços que a borracha encostou. Mesma lista quando nenhum id bate —
 * um `clear` de ids que já sumiram sozinhos não deve repintar a turma.
 */
export function eraseStrokes(
  strokes: readonly AnnotationStroke[],
  ids: readonly string[]
): readonly AnnotationStroke[] {
  if (ids.length === 0) return strokes;
  const gone = new Set(ids);
  const kept = strokes.filter((s) => !gone.has(s.id));
  return kept.length === strokes.length ? strokes : kept;
}

/** Tira o que já sumiu. Mesma lista quando não há nada a tirar. */
export function pruneAnnotations(
  strokes: readonly AnnotationStroke[],
  now: number
): readonly AnnotationStroke[] {
  const alive = strokes.filter((s) => annotationOpacity(s, now) > 0);
  return alive.length === strokes.length ? strokes : alive;
}
