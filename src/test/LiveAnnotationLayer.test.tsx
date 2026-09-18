import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveAnnotationLayer } from '@/components/live/LiveAnnotationLayer';
import { STAGE_CURSOR_MIRROR_ATTR, STAGE_CURSOR_SOURCE_ATTR } from '@/utils/stageCursorDom';
import { ANNOTATION_FADE_MS, ANNOTATION_HOLD_MS } from '@/utils/liveAnnotationStrokes';
import type { AnnotationStroke } from '@/types/liveAnnotation';

/**
 * A camada de desenho na tela de quem assiste.
 *
 * As duas propriedades que importam aqui não são visuais: o traço tem que cair no
 * painel CERTO (o editor de quem está no palco, o espelho de todos os outros), e
 * a camada tem que ser transparente a ponteiro para o aluno — senão o traço do
 * professor rouba o clique dele e ele não consegue mais digitar.
 */

const stroke = (over: Partial<AnnotationStroke> = {}): AnnotationStroke => ({
  id: 's1',
  color: 'menta',
  points: [0.1, 0.1, 0.5, 0.5, 0.9, 0.2],
  fromW: 800,
  fromH: 400,
  done: false,
  seq: 1,
  touchedAt: Date.now(),
  ...over,
});

let mirror: HTMLElement;
let source: HTMLElement;

beforeEach(() => {
  mirror = document.createElement('div');
  mirror.setAttribute(STAGE_CURSOR_MIRROR_ATTR, '');
  source = document.createElement('div');
  source.setAttribute(STAGE_CURSOR_SOURCE_ATTR, '');
  document.body.append(mirror, source);
});

afterEach(() => {
  mirror.remove();
  source.remove();
});

describe('LiveAnnotationLayer', () => {
  it('quem assiste recebe o traço no painel ESPELHO', () => {
    render(<LiveAnnotationLayer strokes={[stroke()]} onStage={false} />);
    expect(mirror.querySelector('[data-testid="live-annotation-layer"]')).not.toBeNull();
    expect(source.querySelector('[data-testid="live-annotation-layer"]')).toBeNull();
  });

  it('quem ESTÁ no palco recebe no próprio editor', () => {
    render(<LiveAnnotationLayer strokes={[stroke()]} onStage />);
    expect(source.querySelector('[data-testid="live-annotation-layer"]')).not.toBeNull();
    expect(mirror.querySelector('[data-testid="live-annotation-layer"]')).toBeNull();
  });

  it('sem captura a camada não come o ponteiro do aluno', () => {
    render(<LiveAnnotationLayer strokes={[stroke()]} onStage={false} />);
    expect(screen.getByTestId('live-annotation-layer').style.pointerEvents).toBe('none');
  });

  it('com captura ela pega o ponteiro do professor', () => {
    render(<LiveAnnotationLayer strokes={[stroke()]} onStage={false} capture={{}} />);
    expect(screen.getByTestId('live-annotation-layer').style.pointerEvents).toBe('auto');
  });

  it('desenha um path por traço, e nenhum com coordenada quebrada', () => {
    render(
      <LiveAnnotationLayer
        strokes={[stroke(), stroke({ id: 's2', color: 'clay' })]}
        onStage={false}
      />
    );
    const paths = screen.getAllByTestId('live-annotation-stroke');
    expect(paths).toHaveLength(2);
    for (const p of paths) expect(p.getAttribute('d')).not.toContain('NaN');
  });

  it('traço já esmaecido não vira elemento nenhum', () => {
    const dead = stroke({ done: true, touchedAt: Date.now() - ANNOTATION_HOLD_MS - ANNOTATION_FADE_MS - 1 });
    render(<LiveAnnotationLayer strokes={[dead]} onStage={false} />);
    expect(screen.queryByTestId('live-annotation-stroke')).toBeNull();
  });

  it('sem painel de destino a camada simplesmente não monta', () => {
    mirror.remove();
    render(<LiveAnnotationLayer strokes={[stroke()]} onStage={false} />);
    expect(screen.queryByTestId('live-annotation-layer')).toBeNull();
  });
});
