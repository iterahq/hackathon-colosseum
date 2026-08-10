/**
 * O TERMINAL que está NA TELA do aluno agora, em memória e só em memória.
 *
 * Irmão do `codeLiveBuffer.service`, e existe pelo mesmo motivo um degrau
 * adiante. O palco do ao-vivo já sabia projetar `code`; para o
 * `terminal_sandbox` ele não tinha NADA do aluno para ler, então caía no
 * espelho da atividade — que **monta a activity de novo no cliente de quem
 * assiste**. `useTerminalSandbox` semeia `initialTerminalModel(scenario)`, ou
 * seja: o professor puxava o aluno pro palco e via um terminal vazio com o nome
 * dele. Nem o que ele digitou, nem o estado do sandbox (Tainan, TG 2026-08-10).
 *
 * ⚠️ **Montar o renderer não é espelhar.** O `code` já era excluído do espelho
 * de atividade por esse exato risco (semearia do storage de QUEM ASSISTE); o
 * terminal tinha o mesmo risco sem a mesma trava, e era invisível porque o
 * resultado PARECE um terminal funcionando — só que vazio, o que se lê como "o
 * aluno não fez nada".
 *
 * PUBLICAR NÃO É PERSISTIR, igual ao buffer de código: nada aqui sobrevive a um
 * reload, então um terminal intocado pode ser PROJETADO sem ser RESTAURADO.
 * Quem separa "abriu" de "trabalhou" é o `hasWork` (`commandCount > 0`).
 *
 * ── POR QUE ESTE MÓDULO DISPARA EVENTO E O DE CÓDIGO NÃO ────────────────────
 * O `codeLiveBuffer` não dispara de propósito: o sinal vivo do código é o
 * `CODE_SNAPSHOT_EVENT` do `codeSnapshot.service`, que já existe e é debounced.
 * O terminal não tem serviço de snapshot nenhum — não persiste rascunho —,
 * então sem um evento próprio o `stage-update` nunca acordaria e o palco
 * congelaria no instante do puxão.
 *
 * A frequência é a razão de isso ser seguro: o buffer muda quando um COMANDO
 * roda ou o aluno recomeça, não a cada tecla. `hasWork: false` (só o banner
 * autorado na tela) não dispara — publicar a montagem de toda atividade como
 * "novidade" reintroduziria justamente o ruído que o `hasWork` existe pra
 * evitar.
 *
 * Padrão do projeto: módulo puro, sem React.
 */
import type { ActivityTerminalScreen } from '@iterahq/activities';

export type { ActivityTerminalScreen } from '@iterahq/activities';

/** O que o palco lê: a tela mais o "isto é trabalho, não só a tela aberta". */
export interface TerminalLiveBuffer {
  screen: ActivityTerminalScreen;
  hasWork: boolean;
}

/**
 * Disparado quando o terminal do aluno MUDA de verdade (rodou comando,
 * recomeçou). O `useClassSession` escuta para re-emitir `stage-update` enquanto
 * este aluno está no palco, e a `LiveSessionPage` para marcar presença
 * "em andamento".
 */
export const TERMINAL_LIVE_EVENT = 'itera:terminal-live';

/**
 * Por `activityId`, não por aluno — o mapa vive na aba do próprio aluno. Sem
 * `storageScope` pelo mesmo motivo do buffer de código: nada é gravado no disco
 * da máquina compartilhada, que é o vazamento que aquele escopo fecha.
 */
const buffers = new Map<string, TerminalLiveBuffer>();

export function publishTerminalLiveBuffer(
  activityId: string,
  screen: ActivityTerminalScreen,
  hasWork: boolean,
): void {
  if (!activityId) return;
  buffers.set(activityId, { screen, hasWork });
  // Só o que É trabalho vira sinal. Ver o bloco sobre frequência acima.
  if (!hasWork || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TERMINAL_LIVE_EVENT, { detail: { activityId } }));
}

export function readTerminalLiveBuffer(activityId: string): TerminalLiveBuffer | null {
  if (!activityId) return null;
  return buffers.get(activityId) ?? null;
}

/**
 * Chamado quando o terminal desmonta ou o aluno troca de atividade. Sem isso o
 * palco projetaria a última tela de uma atividade que o aluno já deixou — e
 * quem assiste não teria como saber que está olhando pra algo que não existe
 * mais.
 */
export function forgetTerminalLiveBuffer(activityId: string): void {
  if (!activityId) return;
  buffers.delete(activityId);
}
