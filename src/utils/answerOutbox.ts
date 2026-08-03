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

/**
 * Teto de AÇÕES por entrada enfileirada — bem abaixo do `MAX_TRACE_ACTIONS`
 * (500) que vale pra escrita direta.
 *
 * O motivo é o mesmo do teto acima, e é aritmético: 200 entradas × 500 ações ×
 * ~60 bytes passa de 5 MB, que é a ordem de grandeza da quota de localStorage.
 * Estourar a quota não custa "um pouco de telemetria" — o `write()` abaixo
 * falha inteiro e a fila PARA DE ACEITAR RESPOSTA. Ou seja: sem esse teto, o
 * dado que enfeita pode derrubar o dado que importa, que é exatamente a regra
 * que o `progress.service` já enuncia (*telemetria nunca pode destruir o
 * registro que ela decora*) — aqui obtida por aparo em vez de por retry.
 *
 * 60 cobre com folga uma tentativa de escolha/ordenação real (as sequências
 * medidas ficam abaixo de 30). O que passa disso é cortado pelo FIM: a CABEÇA é
 * onde está a estratégia (o que o aluno tentou primeiro), e a entrada carimba
 * `actionsTruncated` pra linha não se declarar completa.
 */
export const MAX_QUEUED_TRACE_ACTIONS = 60;

/**
 * Aparo aplicado só na entrada da FILA — a escrita direta (caminho feliz,
 * esmagadora maioria) segue com a sequência inteira.
 */
function trimForQueue(entry: OutboxEntry): OutboxEntry {
  if (entry.kind !== 'progress' || !entry.actions) return entry;
  if (entry.actions.length <= MAX_QUEUED_TRACE_ACTIONS) return entry;
  return {
    ...entry,
    actions: entry.actions.slice(0, MAX_QUEUED_TRACE_ACTIONS),
    actionsTruncated: true,
  };
}

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
  queue.push({ id: crypto.randomUUID(), entry: trimForQueue(entry), attempts: 0, queuedAt: Date.now() });
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
