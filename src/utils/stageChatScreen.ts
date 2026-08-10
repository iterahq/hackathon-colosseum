/**
 * A conversa de chat que PODE atravessar o broadcast do palco — e a leitura dela
 * do outro lado.
 *
 * Irmão do `stageTerminalScreen`, e a mesma disciplina, pelos mesmos dois
 * motivos, que são diferentes um do outro:
 *
 *  1. **Banda.** A conversa sai da aba do aluno, passa pelo Realtime do Supabase
 *     e chega em TODO mundo na sala. O payload do broadcast tem teto; estourado,
 *     o evento é DESCARTADO inteiro — o palco não degrada, ele para, e ninguém
 *     na sala descobre por quê.
 *  2. **Leitura.** O que interessa no palco é o FIM da conversa: os últimos
 *     turnos. Cortar pelo começo preserva exatamente isso.
 *
 * ⚠️ O corte é pelo COMEÇO, nunca pelo fim. Não há índices a rebasear aqui (o
 * chat não tem o rail de ✓ do terminal), então o corte é simples de propósito.
 *
 * ── O QUE ISTO **NÃO** É ────────────────────────────────────────────────────
 * Não é a regra do trace. `PAYLOADS_CARRY_NO_FREE_TEXT` segue valendo e a
 * carve-out do `command_run.command` NÃO foi alargada — o chat continua sem
 * emitir trace nenhum. Isto aqui é o ESPELHO AO VIVO: efêmero, peer-to-peer,
 * nada gravado.
 *
 * ⚠️ E é o espelho que carrega PROSA DO ALUNO, o que o terminal não carregava.
 * Decisão do Tainan, TG 2026-08-10 (*"sim conserta p otro sandbox"*), tomada
 * sabendo dessa diferença. O que a decisão NÃO cobre — e este módulo não
 * transporta — é o rascunho não-enviado do compositor: ver `ActivityChatScreen`
 * e `chatLiveBuffer.service`.
 */
import type { ActivityChatMessage, ActivityChatScreen } from '@iterahq/activities';

/**
 * Quantos turnos do FIM da conversa viajam. 40 turnos × ~600 chars cabem com
 * folga no envelope do broadcast e cobrem qualquer roteiro autorado hoje (o
 * maior tem 4 passos, ou seja ~9 turnos).
 */
export const STAGE_CHAT_MAX_MESSAGES = 40;
/** Teto por turno. Uma resposta canned longa não estoura. */
export const STAGE_CHAT_MAX_MESSAGE_CHARS = 600;
/** Teto do enunciado do passo, que viaja junto com a conversa. */
export const STAGE_CHAT_MAX_PROMPT = 400;

const ROLES = new Set(['user', 'assistant']);

function clampText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** Prepara a conversa local pro broadcast: corta o começo. */
export function clampStageChat(screen: ActivityChatScreen): ActivityChatScreen {
  const dropped = Math.max(0, screen.messages.length - STAGE_CHAT_MAX_MESSAGES);
  return {
    messages: screen.messages.slice(dropped).map((m) => ({
      role: m.role,
      text: clampText(m.text, STAGE_CHAT_MAX_MESSAGE_CHARS),
    })),
    stepIdx: Math.max(0, Math.trunc(screen.stepIdx)),
    stepCount: Math.max(0, Math.trunc(screen.stepCount)),
    stepPrompt: screen.stepPrompt ? clampText(screen.stepPrompt, STAGE_CHAT_MAX_PROMPT) : null,
    won: screen.won === true,
    // NÃO é `messages.length`: o corte acima pode ter comido turnos, e o número
    // que interessa é quantas vezes o ALUNO enviou. Rebaseá-lo pelo que sobrou
    // transformaria uma conversa longa em "ele não fez nada".
    sentCount: Math.max(0, Math.trunc(screen.sentCount)),
  };
}

/**
 * Lê a conversa de um payload que veio da REDE. Fail-closed: qualquer coisa fora
 * de forma vira `undefined`, e o palco cai no estado vazio explicado em vez de
 * renderizar lixo com o nome de um aluno em cima.
 *
 * O teto é reaplicado aqui de propósito — quem envia pode ser um cliente de
 * outra build, e é este lado que renderiza.
 */
export function parseStageChat(value: unknown): ActivityChatScreen | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.messages)) return undefined;
  const messages: ActivityChatMessage[] = [];
  for (const item of raw.messages) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    if (typeof m.text !== 'string') continue;
    // Papel desconhecido cai em `assistant`, nunca em `user`: uma bolha
    // atribuída ao aluno é uma afirmação sobre ELE, e um payload torto não pode
    // produzir uma. O lado do sandbox é o palpite seguro.
    const role = ROLES.has(m.role as string) ? (m.role as ActivityChatMessage['role']) : 'assistant';
    messages.push({ role, text: m.text });
  }
  return clampStageChat({
    messages,
    stepIdx: typeof raw.stepIdx === 'number' ? raw.stepIdx : 0,
    stepCount: typeof raw.stepCount === 'number' ? raw.stepCount : 0,
    stepPrompt: typeof raw.stepPrompt === 'string' ? raw.stepPrompt : null,
    won: raw.won === true,
    sentCount: typeof raw.sentCount === 'number' ? raw.sentCount : 0,
  });
}
