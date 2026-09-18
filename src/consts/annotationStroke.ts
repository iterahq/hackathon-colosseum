import type { AnnotationColor } from '@/types/liveAnnotation';

/**
 * Classe de Tailwind por cor de caneta.
 *
 * Literal, e não `stroke-${color}` montado na hora: o scanner do Tailwind lê o
 * fonte como TEXTO, então uma classe interpolada não entra no CSS e o traço sai
 * sem cor nenhuma — falha que só aparece no build de produção, nunca no dev.
 */
export const ANNOTATION_STROKE_CLASS: Record<AnnotationColor, string> = {
  menta: 'stroke-menta',
  clay: 'stroke-clay',
  azul: 'stroke-azul',
};

/** Grossura da ponta, em px da superfície de QUEM VÊ. */
export const ANNOTATION_STROKE_WIDTH = 3;
