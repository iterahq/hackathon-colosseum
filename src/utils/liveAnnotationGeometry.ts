/**
 * Onde o traço do professor cai na tela de quem recebe.
 *
 * ## Por que NÃO é a conta do cursor
 *
 * `stageCursorPlacement` ancora em PIXEL do emissor, e está certo lá: a fonte do
 * Monaco tem tamanho fixo em px e não escala com o painel, então a mesma FRAÇÃO
 * é outra LINHA de código. Mas um ponteiro é um PONTO — só a posição dele
 * significa alguma coisa, o desenho da seta tem tamanho de tela e pronto.
 *
 * Um traço é uma FORMA, e forma tem duas maneiras de sair errada:
 *
 *   - **Percentagem nos dois eixos** cisalha. Se a superfície do professor é
 *     mais larga em proporção que a do aluno, `x` encolhe mais que `y`: o
 *     círculo vira elipse e a letra manuscrita entorta. Numa feature cujo caso
 *     de uso é ESCREVER à mão, isso é o defeito que se vê primeiro.
 *   - **Pixel do emissor** preserva a forma, mas o que não couber é cortado.
 *     Para uma seta isolada tudo bem (é honesto: aquele pedaço não está na
 *     tela). Para uma frase escrita à mão, metade sumir é perder a frase.
 *
 * Então: **escala UNIFORME com letterbox** — o mesmo fator nos dois eixos, a
 * caixa do emissor centralizada dentro da do receptor. É `object-fit: contain`
 * aplicado ao desenho. A letra continua sendo a mesma letra, e nada é cortado.
 *
 * O preço é que o traço não gruda no caractere exato quando as proporções
 * diferem muito — e é o preço certo, porque o professor está rodeando uma
 * REGIÃO ("esse bloco aqui"), não apontando um caractere. Quem aponta caractere
 * é o cursor, que continua existindo ao lado.
 */

import type { AnnotationTransform } from '@/types/liveAnnotation';

/** Teto para uma dimensão vinda do fio — mesmo motivo do `MAX_PANE_PX`. */
const MAX_SURFACE_PX = 8192;

function sane(v: number): boolean {
  return Number.isFinite(v) && v > 0 && v <= MAX_SURFACE_PX;
}

/**
 * `contain` do emissor dentro do receptor.
 *
 * Qualquer dimensão insana (zero, negativa, `NaN`, absurda) devolve a identidade
 * em vez de `NaN` no `d` do path: um traço um pouco fora do lugar é recuperável,
 * um `<path d="MNaN,NaN">` some sem dizer por quê.
 */
export function annotationTransform(
  fromW: number,
  fromH: number,
  toW: number,
  toH: number
): AnnotationTransform {
  if (!sane(fromW) || !sane(fromH) || !sane(toW) || !sane(toH)) {
    return { scale: 1, dx: 0, dy: 0 };
  }
  const scale = Math.min(toW / fromW, toH / fromH);
  return {
    scale,
    dx: (toW - fromW * scale) / 2,
    dy: (toH - fromH * scale) / 2,
  };
}

/**
 * Ponto normalizado (0..1 da superfície do EMISSOR) → px da superfície de quem
 * recebe. `fromW`/`fromH` entram porque a normalização apagou a proporção
 * original, e é ela que decide o letterbox.
 */
export function annotationPoint(
  nx: number,
  ny: number,
  fromW: number,
  fromH: number,
  t: AnnotationTransform
): { x: number; y: number } {
  return {
    x: t.dx + nx * fromW * t.scale,
    y: t.dy + ny * fromH * t.scale,
  };
}

/**
 * O `d` de um traço, suavizado por ponto médio quadrático.
 *
 * Sem suavização o traço fica em facetas visíveis: os pontos chegam em lote a
 * ~5 Hz de rede mas foram capturados a 60 Hz, e mesmo assim uma polilinha crua
 * de mão livre mostra cada vértice. `Q p[i], meio(p[i], p[i+1])` passa a curva
 * pelos MEIOS e usa os pontos como controle, que é o truque padrão de tinta:
 * custa uma passada e não precisa de segunda derivada.
 *
 * Um ponto só vira um ponto desenhável (`m 0 0 l 0.01 0`) em vez de sumir —
 * tocar a caneta sem arrastar é um gesto real, e um `d` de `M` sozinho não
 * pinta nada mesmo com `stroke-linecap: round`.
 */
export function annotationPath(
  points: readonly number[],
  fromW: number,
  fromH: number,
  t: AnnotationTransform
): string {
  const n = Math.floor(points.length / 2);
  if (n === 0) return '';

  const at = (i: number) => annotationPoint(points[i * 2], points[i * 2 + 1], fromW, fromH, t);
  const r = (v: number) => Math.round(v * 10) / 10;

  const first = at(0);
  if (n === 1) return `M${r(first.x)},${r(first.y)}l0.01,0`;

  let d = `M${r(first.x)},${r(first.y)}`;
  for (let i = 1; i < n - 1; i += 1) {
    const c = at(i);
    const next = at(i + 1);
    d += `Q${r(c.x)},${r(c.y)} ${r((c.x + next.x) / 2)},${r((c.y + next.y) / 2)}`;
  }
  const last = at(n - 1);
  d += `L${r(last.x)},${r(last.y)}`;
  return d;
}
