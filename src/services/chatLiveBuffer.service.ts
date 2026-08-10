/**
 * O CHAT que está NA TELA do aluno agora, em memória e só em memória.
 *
 * Irmão do `codeLiveBuffer.service` e do `terminalLiveBuffer.service`, e existe
 * pelo mesmo motivo um kind adiante. O palco do ao-vivo já sabia projetar `code`
 * e `terminal`; para o `chat_sandbox` ele não tinha NADA do aluno para ler,
 * então caía no espelho da atividade — que **monta a activity de novo no cliente
 * de quem assiste**. `useSandboxScenario` semeia `initialModel(scenario,
 * locale)`, ou seja: o professor puxava o aluno pro palco e via a saudação
 * autorada com o nome dele em cima, e nada da conversa que ele teve.
 *
 * ⚠️ **Montar o renderer não é espelhar.** É a mesma lição do terminal, e no
 * chat ela é ainda mais difícil de ver: uma janela de chat com uma saudação
 * dentro *parece* um sandbox de chat funcionando.
 *
 * PUBLICAR NÃO É PERSISTIR, igual aos dois irmãos: nada aqui sobrevive a um
 * reload, então um chat intocado pode ser PROJETADO sem ser RESTAURADO. Quem
 * separa "abriu" de "trabalhou" é o `hasWork` (`ranPromptCount > 0`).
 *
 * ── ⚠️ ESTE BUFFER GUARDA PROSA DO ALUNO — E ISSO FOI DECIDIDO ──────────────
 * O terminal espelha **vocabulário de ferramenta**: `git status` é a mesma
 * string pra qualquer pessoa que conhece a ferramenta. O chat espelha **o que o
 * aluno escreveu**. Projetar isso na parede é decisão de privacidade, não de
 * layout — foi levantada como tal e o Tainan escolheu fazer (TG 2026-08-10:
 * *"sim conserta p otro sandbox"*).
 *
 * A escolha foi de ESPELHO, então as três restrições que fazem dela um espelho
 * estão no código, não só no comentário:
 *
 *  1. **Efêmero.** `Map` em memória. Nada vai pro banco, nada vai pro disco.
 *     Não existe `storageScope` aqui pelo mesmo motivo dos irmãos: nada é
 *     gravado na máquina compartilhada, que é o vazamento que aquele escopo
 *     fecha.
 *  2. **Só no puxão explícito.** Publicar preenche o buffer; publicar não
 *     transmite. O que sai da aba do aluno é a resposta ao `stage-request` do
 *     professor (`gatherStageContent`). Não há broadcast ambiente do que os
 *     alunos estão digitando.
 *  3. **Só o que foi ENVIADO.** O rascunho não-enviado do compositor não chega
 *     até aqui — quem monta a tela é o `SandboxScenarioShell`, a partir de
 *     `model.messages`, e nunca do `inputText`. A regra está escrita também no
 *     tipo (`ActivityChatScreen`), que é onde ela sobrevive a um refactor.
 *
 * ── POR QUE ESTE MÓDULO DISPARA EVENTO, IGUAL AO DO TERMINAL ────────────────
 * O `codeLiveBuffer` não dispara de propósito: o sinal vivo do código é o
 * `CODE_SNAPSHOT_EVENT` do `codeSnapshot.service`, que já existe e é debounced.
 * O chat, como o terminal, não tem serviço de snapshot nenhum — não persiste
 * rascunho —, então sem um evento próprio o `stage-update` nunca acordaria e o
 * palco congelaria no instante do puxão: toda mensagem enviada DEPOIS do puxão
 * seria invisível pra sala.
 *
 * A frequência é a razão de isso ser seguro: o buffer muda quando uma mensagem é
 * ENVIADA, não a cada chip clicado. `hasWork: false` (só a saudação autorada na
 * tela) não dispara.
 *
 * Padrão do projeto: módulo puro, sem React.
 */
import type { ActivityChatScreen } from '@iterahq/activities';

export type { ActivityChatMessage, ActivityChatScreen } from '@iterahq/activities';

/** O que o palco lê: a conversa mais o "isto é trabalho, não só a tela aberta". */
export interface ChatLiveBuffer {
  screen: ActivityChatScreen;
  hasWork: boolean;
}

/**
 * Disparado quando o chat do aluno MUDA de verdade (enviou uma mensagem). O
 * `useClassSession` escuta para re-emitir `stage-update` enquanto este aluno
 * está no palco, e a `LiveSessionPage` para marcar presença "em andamento".
 */
export const CHAT_LIVE_EVENT = 'itera:chat-live';

/** Por `activityId`, não por aluno — o mapa vive na aba do próprio aluno. */
const buffers = new Map<string, ChatLiveBuffer>();

export function publishChatLiveBuffer(
  activityId: string,
  screen: ActivityChatScreen,
  hasWork: boolean,
): void {
  if (!activityId) return;
  buffers.set(activityId, { screen, hasWork });
  // Só o que É trabalho vira sinal. Ver o bloco sobre frequência acima.
  if (!hasWork || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHAT_LIVE_EVENT, { detail: { activityId } }));
}

export function readChatLiveBuffer(activityId: string): ChatLiveBuffer | null {
  if (!activityId) return null;
  return buffers.get(activityId) ?? null;
}

/**
 * Chamado quando o chat desmonta ou o aluno troca de atividade. Sem isso o palco
 * projetaria a última conversa de uma atividade que o aluno já deixou — e quem
 * assiste não teria como saber que está olhando pra algo que não existe mais.
 *
 * Aqui isso vale duplo: é a conversa DELE que ficaria no ar depois de ele sair.
 */
export function forgetChatLiveBuffer(activityId: string): void {
  if (!activityId) return;
  buffers.delete(activityId);
}
