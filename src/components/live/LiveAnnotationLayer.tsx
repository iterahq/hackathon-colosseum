import { createPortal } from 'react-dom';
import {
  STAGE_CURSOR_MIRROR_SELECTOR,
  STAGE_CURSOR_SOURCE_SELECTOR,
} from '@/utils/stageCursorDom';
import { annotationPath, annotationTransform } from '@/utils/liveAnnotationGeometry';
import { annotationOpacity } from '@/utils/liveAnnotationStrokes';
import { useFadeClock, usePaneBySelector, useSurfaceSize } from '@/hooks/useAnnotationSurface';
import { ANNOTATION_STROKE_CLASS, ANNOTATION_STROKE_WIDTH } from '@/consts/annotationStroke';
import type { AnnotationStroke } from '@/types/liveAnnotation';

/**
 * Os traços do professor desenhados por cima do palco.
 *
 * Mesmo portal do `InstructorCursorLayer`, e pelo mesmo motivo: para o aluno que
 * ESTÁ no palco o destino é o editor DELE, que mora dentro da árvore da activity
 * — e essa árvore não cresce prop de aula ao vivo.
 *
 * ## A opacidade não é estado
 *
 * O esmaecimento anda num relógio só (`useFadeClock`) e vira atributo de
 * `<path>`. Um `useState` por traço faria cada quadro do fade passar pelo
 * reconciliador com N componentes; assim o que muda é um número num atributo.
 */
export function LiveAnnotationLayer({
  strokes,
  onStage,
  capture,
  erasing,
}: {
  strokes: readonly AnnotationStroke[];
  /** Este cliente é o dono do trabalho no palco → desenhar no editor dele. */
  onStage: boolean;
  /**
   * Handlers de captura, só no cliente do professor e só com a caneta armada.
   * Ausente = camada transparente a ponteiro, que é o que o aluno precisa: ele
   * continua clicando e digitando no próprio editor por baixo do traço.
   */
  capture?: React.DOMAttributes<HTMLDivElement>;
  /** Muda só o cursor: com a borracha na mão, a mira não pode parecer caneta. */
  erasing?: boolean;
}) {
  const selector = onStage ? STAGE_CURSOR_SOURCE_SELECTOR : STAGE_CURSOR_MIRROR_SELECTOR;
  const pane = usePaneBySelector(selector);
  const { w, h } = useSurfaceSize(pane);
  const now = useFadeClock(strokes.some((s) => s.done));

  if (!pane || !pane.isConnected) return null;

  return createPortal(
    <div
      data-testid="live-annotation-layer"
      className="absolute inset-0 z-30"
      style={{
        pointerEvents: capture ? 'auto' : 'none',
        touchAction: capture ? 'none' : undefined,
        cursor: capture ? (erasing ? 'cell' : 'crosshair') : undefined,
      }}
      {...capture}
    >
      <svg className="h-full w-full overflow-visible" aria-hidden>
        {strokes.map((s) => {
          const opacity = annotationOpacity(s, now);
          if (opacity <= 0) return null;
          const t = annotationTransform(s.fromW, s.fromH, w, h);
          return (
            <path
              key={s.id}
              data-testid="live-annotation-stroke"
              d={annotationPath(s.points, s.fromW, s.fromH, t)}
              className={ANNOTATION_STROKE_CLASS[s.color]}
              fill="none"
              strokeWidth={ANNOTATION_STROKE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={opacity}
            />
          );
        })}
      </svg>
    </div>,
    pane
  );
}
