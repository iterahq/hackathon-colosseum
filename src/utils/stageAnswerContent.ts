/**
 * Gathers the content a learner replies with when the instructor pulls their
 * work to the class stage (`stage-answer`). All data is read from the learner's
 * OWN local state — no DB, no migration (the class is synchronous, the student is
 * online): the terminal screen on display (`readTerminalLiveBuffer`) is staged as
 * `terminal`; the chat conversation on display (`readChatLiveBuffer`) is staged
 * as `chat`; the code-snack source on screen (`readCodeLiveBuffer`, falling back
 * to the saved `readCodeSnapshot`) is staged as `code`; otherwise a best-effort
 * correct/wrong summary from `readStoredAnswer`.
 *
 * The three live buffers are mutually exclusive in practice — one activity is one
 * kind — so their order only decides which wins if a stale entry ever survived a
 * `forget`, and the newest mirrors are checked first so a more recently added one
 * cannot be masked by an older one.
 *
 * ADR-4 (revised 2026-07-23): the professor pulls WORK IN PROGRESS too, not only
 * finished answers — following how the class is advancing is the whole point. So
 * this NEVER returns null anymore. It always returns a `status` describing where
 * the learner is, so the pull never fails in silence (which looked to the
 * professor like a broken button). `not_started` is a statement about THIS
 * signal, not about the learner: only a code source or a submitted answer is
 * visible here, so a learner mid-way through any other kind reports it too —
 * which is why the stage projects the current activity instead of announcing it.
 * It is also NOT the same as "nothing to project": a `code` reply can be
 * `not_started` and still carry the starter the learner is staring at.
 */
import { readChatLiveBuffer } from '@/services/chatLiveBuffer.service';
import { readCodeLiveBuffer } from '@/services/codeLiveBuffer.service';
import { readCodeSnapshot } from '@/services/codeSnapshot.service';
import { readTerminalLiveBuffer } from '@/services/terminalLiveBuffer.service';
import { readStoredAnswer } from '@/utils/liveAnswerStorage';
import { clampStageChat } from '@/utils/stageChatScreen';
import { clampStageTerminal } from '@/utils/stageTerminalScreen';
import type { StageContent, StageWorkStatus } from '@/types/liveClass';

export type { StageContent, StageWorkStatus } from '@/types/liveClass';

const STATUSES: StageWorkStatus[] = ['submitted', 'in_progress', 'not_started'];

/**
 * Reads a `status` off a channel payload. Defaults to `submitted` because a
 * client running the PREVIOUS build omits the field and only ever replied when it
 * had a finished answer — a mid-class deploy must not mislabel those as drafts.
 */
export function parseStageStatus(value: unknown): StageWorkStatus {
  return STATUSES.includes(value as StageWorkStatus) ? (value as StageWorkStatus) : 'submitted';
}

export function gatherStageContent(sessionId: string, activityId: string): StageContent {
  const submitted = readStoredAnswer(sessionId, activityId);
  // O TERMINAL vem primeiro, e a ordem importa: sem este ramo o palco não tinha
  // nada do aluno pra ler num `terminal_sandbox` e caía no espelho da atividade,
  // que MONTA a activity no cliente de quem assiste e semeia um terminal vazio.
  // A sala via o nome do aluno em cima de um prompt limpo — nem o que ele
  // digitou, nem o estado do sandbox (Tainan, TG 2026-08-10). Ver
  // `terminalLiveBuffer.service`.
  const terminal = readTerminalLiveBuffer(activityId);
  if (terminal) {
    return {
      kind: 'terminal',
      // `content` fica vazio DE PROPÓSITO: a tela viaja tipada em `terminal`, e
      // um cliente de build anterior lê um `kind` que não conhece e cai no
      // estado vazio explicado em vez de renderizar JSON no projetor.
      content: '',
      // Mesmo critério do `code`: `not_started` fala do TRABALHO (nenhum comando
      // rodado), sem esconder da turma a tela que ele está olhando.
      status: submitted ? 'submitted' : terminal.hasWork ? 'in_progress' : 'not_started',
      terminal: clampStageTerminal(terminal.screen),
    };
  }
  // O CHAT, pela mesma razão do terminal: sem este ramo o palco não tinha nada
  // do aluno pra ler num `chat_sandbox` e caía no espelho da atividade, que
  // MONTA a activity no cliente de quem assiste e semeia `initialModel` — a
  // saudação autorada, e nada da conversa dele (Tainan, TG 2026-08-10: *"sim
  // conserta p otro sandbox"*).
  //
  // ⚠️ O que viaja aqui é PROSA do aluno, e só a ENVIADA. O buffer nunca recebe
  // o rascunho do compositor; ver `chatLiveBuffer.service` para as três
  // restrições que fazem disto um espelho, e não uma coleta.
  const chat = readChatLiveBuffer(activityId);
  if (chat) {
    return {
      kind: 'chat',
      // `content` vazio DE PROPÓSITO, mesma regra do terminal.
      content: '',
      // Mesmo critério: `not_started` fala do TRABALHO (nenhuma mensagem
      // enviada), sem esconder da turma a tela que ele está olhando.
      status: submitted ? 'submitted' : chat.hasWork ? 'in_progress' : 'not_started',
      chat: clampStageChat(chat.screen),
    };
  }
  // O buffer vivo vem PRIMEIRO porque ele existe desde o mount, enquanto o
  // snapshot só nasce depois da primeira tecla — era essa diferença que fazia o
  // aluno ter que "mexer em algo" antes do professor conseguir puxá-lo (P1).
  // O snapshot segue como fallback pro caso do buffer não existir: aba fechada,
  // outro kind na tela, cliente de build antigo. Ignorá-lo quando há buffer é
  // seguro porque o editor semeia DO snapshot — o buffer nunca é o mais velho.
  const live = readCodeLiveBuffer(activityId);
  const source = live ?? readCodeSnapshot(activityId);
  if (source) {
    return {
      kind: 'code',
      content: source.code,
      // `not_started` aqui é a verdade sobre o ALUNO (abriu e não tem trabalho)
      // sem esconder da turma o código que está na tela dele. É `hasWork`, e não
      // "digitou nesta montagem": quem recarregou a aba e teve o rascunho
      // restaurado TEM trabalho, e projetá-lo como intocado seria falso.
      status: submitted ? 'submitted' : live && !live.hasWork ? 'not_started' : 'in_progress',
    };
  }
  if (submitted) {
    // `content` segue sendo o veredito porque um cliente do build ANTERIOR lê
    // exatamente isso; `response` é o acréscimo — o que o aluno de fato marcou.
    return {
      kind: 'answer',
      content: submitted.correct ? 'correct' : 'wrong',
      status: 'submitted',
      response: submitted.response,
    };
  }
  // Nothing local at all — the learner is in the room but hasn't touched this
  // activity yet. Explicit empty state (not null) so the pull still resolves.
  return { kind: 'empty', content: '', status: 'not_started' };
}
