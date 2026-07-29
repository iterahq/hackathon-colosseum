/**
 * Fila durável das escritas de resposta que a rede engoliu.
 *
 * A aula roda em wifi de escola/comunidade, onde queda de 30s é rotina, não
 * exceção. Antes disso, uma escrita que falhava caía num `catch {}` silencioso:
 * o aluno via o vermelho/verde na tela (estado local), o professor via o
 * broadcast (efêmero), e o registro durável simplesmente não existia. Quando a
 * rede voltava, ninguém tentava de novo — a resposta tinha sumido de verdade,
 * só que sem ninguém saber.
 *
 * Aqui a escrita que falha vira uma entrada em localStorage e é retentada
 * quando a rede volta. É puro de propósito (zero React, zero Supabase): quem
 * sabe FALAR com o banco é o hook; este módulo só sabe guardar e devolver.
 */

import type { OutboxEntry, QueuedWrite } from '@/types/answerOutbox';

export type { OutboxEntry, QueuedWrite } from '@/types/answerOutbox';

const STORAGE_KEY = 'itera.answer.outbox';

/**
 * Teto da fila. Uma resposta perdida é ruim; um localStorage estourado é pior,
 * porque derruba TODA a persistência local (inclusive a proteção de refresh).
 * 200 entradas cobrem uma aula inteira de um aluno com folga; passando disso,
 * as MAIS ANTIGAS saem — as recentes são as que ainda têm chance de importar
 * para a aula que está acontecendo.
 */
export const MAX_QUEUED_WRITES = 200;

export function readOutbox(): QueuedWrite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedWrite);
  } catch {
    return [];
  }
}

function isQueuedWrite(v: unknown): v is QueuedWrite {
  if (!v || typeof v !== 'object') return false;
  const w = v as QueuedWrite;
  return typeof w.id === 'string' && !!w.entry && typeof w.entry === 'object';
}

function write(queue: QueuedWrite[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue.slice(-MAX_QUEUED_WRITES)));
  } catch {
    // Storage indisponível (modo privado/quota) — degrada para o comportamento antigo.
  }
}

/**
 * Enfileira uma escrita que falhou.
 *
 * Deduplica por ALVO, não por conteúdo: a mesma atividade da mesma sessão só
 * ocupa uma vaga, e a tentativa mais recente vence. Sem isso, um aluno teimando
 * numa atividade com a rede fora enfileiraria uma entrada por clique e depois
 * despejaria todas em ordem — deixando no banco a PRIMEIRA resposta como se
 * fosse a última.
 */
export function enqueueWrite(entry: OutboxEntry): void {
  const queue = readOutbox().filter((q) => targetOf(q.entry) !== targetOf(entry));
  queue.push({ id: crypto.randomUUID(), entry, attempts: 0, queuedAt: Date.now() });
  write(queue);
}

function targetOf(entry: OutboxEntry): string {
  return entry.kind === 'progress'
    ? `progress:${entry.activityId}`
    : `classAnswer:${entry.sessionId}:${entry.activityId}`;
}

/**
 * Tenta enviar tudo o que está na fila, na ordem em que entrou.
 *
 * `send` devolve `true` só quando a escrita realmente pousou. O que falhar
 * continua na fila com `attempts` incrementado — nunca é descartado por ter
 * tentado demais. Uma resposta de aluno não é telemetria: se ela ainda não
 * chegou, a próxima janela de rede é exatamente a chance que sobrou.
 *
 * Devolve quantas entradas foram drenadas.
 */
export async function flushOutbox(
  send: (entry: OutboxEntry) => Promise<boolean>
): Promise<number> {
  const queue = readOutbox();
  if (queue.length === 0) return 0;

  const kept: QueuedWrite[] = [];
  let sent = 0;
  for (const item of queue) {
    let ok = false;
    try {
      ok = await send(item.entry);
    } catch {
      ok = false;
    }
    if (ok) sent += 1;
    else kept.push({ ...item, attempts: item.attempts + 1 });
  }

  // Reler antes de gravar: um envio pode ter demorado o suficiente para o aluno
  // responder outra atividade, e sobrescrever com o snapshot velho apagaria a
  // entrada nova.
  const arrivedMeanwhile = readOutbox().filter((q) => !queue.some((old) => old.id === q.id));
  write([...kept, ...arrivedMeanwhile]);
  return sent;
}

/** Só para os testes e para o logout — a fila é por dispositivo, não por usuário. */
export function clearOutbox(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // idem readOutbox
  }
}
