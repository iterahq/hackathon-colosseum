/**
 * O que trafega quando o professor desenha por cima da aula.
 *
 * Efêmero por contrato: nada aqui tem tabela, nem migration, nem RLS própria. O
 * traço nasce no `pointerdown` do professor, vive alguns segundos na memória de
 * quem está com a aula aberta, e some. Quem chega atrasado não vê o que já foi
 * desenhado, e isso é a decisão — não uma limitação: a anotação acompanha a FALA
 * ("esse bloco aqui"), e uma anotação sem a fala não explica nada.
 *
 * É essa efemeridade que faz o resto ficar barato. Um lote de pontos perdido no
 * caminho abre um buraco no traço que se cura sozinho em segundos, então o
 * transporte não precisa de confirmação, reenvio, nem ordem garantida.
 */

/**
 * Ponta da caneta. Tokens da marca, não hex solto — a paleta é a mesma da UI.
 *
 * São TRÊS, e são estes três, porque precisam se distinguir entre si sobre código
 * escuro. `streak` ficou de fora apesar de ser token: ele resolve para o mesmo
 * `#E0A86F` do `clay`, e duas canetas idênticas com nomes diferentes é uma
 * escolha que o professor faz uma vez e nunca mais confia.
 */
export type AnnotationColor = 'menta' | 'clay' | 'azul';

export const ANNOTATION_COLORS: readonly AnnotationColor[] = ['menta', 'clay', 'azul'];

/**
 * O que o ponteiro do professor faz na superfície. `null` (fora daqui) é a mão
 * livre de novo: sem ferramenta escolhida ele volta a ser só ponteiro, e o
 * arrasto atravessa a camada para o editor por baixo.
 *
 * A borracha tira o traço INTEIRO que ela encosta, não o pedaço. Traço aqui é
 * uma unidade de fala ("esse bloco aqui") e não pintura: apagar o meio de uma
 * seta deixa duas pontas soltas na tela do aluno, que explicam menos que nada.
 */
export type AnnotationTool = 'pen' | 'eraser';

/** `contain` do emissor dentro do receptor. Ver `utils/liveAnnotationGeometry`. */
export interface AnnotationTransform {
  /** Fator único aplicado aos dois eixos. */
  scale: number;
  /** Deslocamento do letterbox, em px da superfície de quem recebe. */
  dx: number;
  dy: number;
}

/** Um traço montado na memória de quem recebe, a partir de vários lotes. */
export interface AnnotationStroke {
  id: string;
  color: AnnotationColor;
  /**
   * `[x0,y0,x1,y1,…]` normalizado 0..1 da superfície do EMISSOR. Achatado, e não
   * `{x,y}[]`, porque é o formato que vai no fio: metade dos bytes de JSON e
   * nenhuma alocação por ponto ao remontar.
   */
  points: number[];
  /** Tamanho da superfície do emissor — é ela que decide o letterbox. */
  fromW: number;
  fromH: number;
  /** O emissor levantou a caneta. É daqui que o relógio do sumiço conta. */
  done: boolean;
  /** Último `seq` aplicado, para descartar lote repetido ou atrasado. */
  seq: number;
  /** Quando o último lote chegou (epoch ms). */
  touchedAt: number;
}

/** Um lote de pontos no fio. Vários por traço. */
export interface AnnotationFrame {
  /** Quem desenhou. Quem recebe descarta tudo que não for o instrutor da sessão. */
  userId: string;
  strokeId: string;
  color: AnnotationColor;
  points: number[];
  fromW: number;
  fromH: number;
  /**
   * Monotônico DENTRO do traço. Só serve para descartar repetido/atrasado: um
   * salto significa lote perdido, e a resposta certa a isso é seguir em frente,
   * porque o buraco some junto com o traço.
   */
  seq: number;
  /** Último lote deste traço. */
  done?: boolean;
}
