import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { InstructorCursorLayer } from '@/components/live/InstructorCursorLayer';
import type { StageCursor } from '@/types/liveClass';

/**
 * Onde o ponteiro do professor é DESENHADO (K1).
 *
 * Dois destinos, e a diferença é o ponto do item: quem está no palco vê no
 * próprio editor (`data-stage-cursor-source`) — é o professor apontando na tela
 * dele; quem assiste vê no espelho (`data-stage-cursor-mirror`). Por isso é
 * portal e não prop: o painel de origem mora dentro da árvore da activity, que
 * não cresce prop de aula ao vivo (`activityPublicContract.test.ts`).
 */

const cursor: StageCursor = {
  activityId: 'act-1',
  userId: 'prof-1',
  x: 0.5,
  y: 0.25,
  visible: true,
  caret: null,
  t: 1000,
};

let source: HTMLDivElement;
let mirror: HTMLDivElement;

beforeEach(() => {
  source = document.createElement('div');
  source.setAttribute('data-stage-cursor-source', '');
  mirror = document.createElement('div');
  mirror.setAttribute('data-stage-cursor-mirror', '');
  document.body.append(source, mirror);
});

afterEach(() => {
  source.remove();
  mirror.remove();
});

function renderLayer(over: Partial<Parameters<typeof InstructorCursorLayer>[0]> = {}) {
  return render(
    <InstructorCursorLayer
      cursor={cursor}
      click={null}
      onStage={false}
      instructorName="Prof"
      intervalMs={200}
      {...over}
    />
  );
}

describe('InstructorCursorLayer', () => {
  it('desenha no ESPELHO para quem está assistindo', () => {
    renderLayer();
    const drawn = screen.getByTestId('stage-cursor');
    expect(mirror.contains(drawn)).toBe(true);
    expect(source.contains(drawn)).toBe(false);
    expect(drawn.getAttribute('data-stage-cursor-variant')).toBe('instructor');
  });

  it('desenha no EDITOR DO ALUNO quando é ele que está no palco', () => {
    renderLayer({ onStage: true });
    const drawn = screen.getByTestId('stage-cursor');
    expect(source.contains(drawn)).toBe(true);
    expect(mirror.contains(drawn)).toBe(false);
  });

  it('leva o nome do professor, que é o que desfaz a ambiguidade com o cursor do próprio aluno', () => {
    renderLayer();
    expect(screen.getByTestId('stage-cursor-label')).toHaveTextContent('Prof');
  });

  it('não desenha nada sem frame de professor', () => {
    renderLayer({ cursor: null });
    expect(screen.queryByTestId('stage-cursor')).toBeNull();
  });

  it('não desenha nada quando o painel de destino não existe (atividade sem editor)', () => {
    source.remove();
    mirror.remove();
    renderLayer();
    expect(screen.queryByTestId('stage-cursor')).toBeNull();
  });

  it('acha o painel que montou DEPOIS dele — Monaco não está pronto no primeiro frame', async () => {
    mirror.remove();
    renderLayer();
    expect(screen.queryByTestId('stage-cursor')).toBeNull();
    // Procurar uma vez só perderia o primeiro frame do professor — ou todos eles,
    // porque o painel de código monta depois da página.
    document.body.append(mirror);
    await waitFor(() => expect(screen.getByTestId('stage-cursor')).toBeInTheDocument(), {
      timeout: 1500,
    });
    expect(mirror.contains(screen.getByTestId('stage-cursor'))).toBe(true);
  });

  it('mostra o pulso do clique e o retira sozinho', () => {
    const { rerender } = renderLayer({ click: { x: 0.5, y: 0.5, t: 1 } });
    expect(screen.getByTestId('stage-click-ripple')).toBeInTheDocument();

    rerender(
      <InstructorCursorLayer
        cursor={cursor}
        click={null}
        onStage={false}
        instructorName="Prof"
        intervalMs={200}
      />
    );
    expect(screen.queryByTestId('stage-click-ripple')).toBeNull();
  });
});
