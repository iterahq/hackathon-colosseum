import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { StageCursorOverlay } from '@/components/live/StageCursorOverlay';
import { StageClickRipple } from '@/components/live/StageClickRipple';
import {
  STAGE_CURSOR_MIRROR_SELECTOR,
  STAGE_CURSOR_SOURCE_SELECTOR,
} from '@/utils/stageCursorDom';
import type { StageClick, StageCursor } from '@/types/liveClass';

/**
 * O ponteiro do PROFESSOR desenhado na tela de quem assiste (K1 — Tainan na call
 * de 06/08: "aí o prof ajuda dentro da tela do proprio user").
 *
 * ## Portal, e não prop
 *
 * Para o aluno que ESTÁ no palco o painel de destino é o editor DELE, que mora
 * dentro da árvore da activity — e essa árvore tem fronteira pública
 * (`activityPublicContract.test.ts`): ela não cresce prop de aula ao vivo. O
 * portal entra pelo mesmo marcador `data-*` que o capturador já usa, então o
 * pacote de activities continua sem saber que existe aula ao vivo.
 *
 * ## Dois destinos, um componente
 *
 * `onStage` escolhe o painel: o de ORIGEM na tela de quem está no palco, o
 * ESPELHO na de todos os outros. Os dois painéis NÃO medem igual
 * (`h-[clamp(360px,55vh,720px)]`), então quem faz o ponteiro cair no mesmo
 * caractere é o tamanho do painel do professor viajando no frame — não o 0..1.
 */
export function InstructorCursorLayer({
  cursor,
  click,
  onStage,
  instructorName,
  intervalMs,
}: {
  cursor: StageCursor | null;
  click: StageClick | null;
  /** Este cliente é o dono do trabalho no palco → desenhar no editor dele. */
  onStage: boolean;
  instructorName: string;
  intervalMs: number;
}) {
  const selector = onStage ? STAGE_CURSOR_SOURCE_SELECTOR : STAGE_CURSOR_MIRROR_SELECTOR;
  const [pane, setPane] = useState<HTMLElement | null>(null);
  const activityId = cursor?.activityId ?? null;

  useEffect(() => {
    if (!activityId) {
      setPane(null);
      return;
    }
    // O painel pode montar DEPOIS deste layer (Monaco, troca de atividade), então
    // procurar uma vez só perderia o primeiro frame — ou todos eles.
    const now = document.querySelector<HTMLElement>(selector);
    if (now) {
      setPane(now);
      return;
    }
    const id = window.setInterval(() => {
      const late = document.querySelector<HTMLElement>(selector);
      if (!late) return;
      setPane(late);
      window.clearInterval(id);
    }, 250);
    return () => window.clearInterval(id);
  }, [selector, activityId]);

  if (!pane || !pane.isConnected || !cursor) return null;

  return createPortal(
    <>
      <StageCursorOverlay
        cursor={cursor}
        authorName={instructorName}
        intervalMs={intervalMs}
        variant="instructor"
      />
      <StageClickRipple click={click} paneW={cursor.paneW} paneH={cursor.paneH} />
    </>,
    pane
  );
}
