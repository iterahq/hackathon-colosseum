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
 * Teto do SNAPSHOT DO ENUNCIADO por entrada enfileirada (migration 0037).
 *
 * Mesma aritmética do teto acima, e o mesmo desfecho se ela for ignorada: 200
 * entradas × um spec grande encosta na quota do localStorage, e quota estourada
 * não custa "um pouco de telemetria" — o `write()` falha inteiro e a fila PARA
 * DE ACEITAR RESPOSTA.
 *
 * 16.000 caracteres com folga real: medido no projeto em 2026-08-04, o spec
 * MÁXIMO de todas as 275 atividades do catálogo tem 8.331 bytes e a média tem
 * 1.263. Ou seja, hoje nada é descartado por este teto; ele existe pra que uma
 * atividade futura anormalmente grande não derrube a fila.
 *
 * ⚠️ DESCARTA, NUNCA TRUNCA. Meia sequência de ações ainda é uma sequência (e a
 * entrada carimba `actionsTruncated`); meio enunciado é jsonb corrompido que
 * um replay renderizaria como se fosse o que o aluno leu. A coluna fica NULL,
 * que já significa "não capturado" — menos informação, nunca informação falsa.
 */
export const MAX_QUEUED_SPEC_SNAPSHOT_CHARS = 16_000;

/**
 * Teto do CONTEXTO PEDAGÓGICO por entrada enfileirada (migration 0038).
 *
 * Os seis campos normalizados (`template`, `family`, `mental_structures`,
 * `metaphor`, `difficulty`, `objective`) somam dezenas de bytes e nunca
 * ameaçariam a quota. Quem pode crescer sem teto é o `extra` — a passagem
 * VERBATIM de toda chave autorada que este build não reconhece, que existe
 * justamente pra não perder um campo de gramática inventado depois (ADR-2). Um
 * autor que colar um objeto grande ali não pode derrubar a fila inteira.
 *
 * ⚠️ APARA EM DOIS DEGRAUS, e a ordem importa: primeiro cai só o `extra`,
 * mantendo os campos que a Fase 4 realmente consulta; o contexto inteiro só sai
 * se nem assim couber. Descartar o contexto por causa do `extra` seria perder
 * a estrutura mental por causa de um campo que ninguém ainda consulta.
 *
 * 4.000 caracteres: ordem de grandeza do maior `extra` plausível, e 200 × 4 kB
 * ainda fica bem abaixo dos ~5 MB de quota.
 */
export const MAX_QUEUED_PEDAGOGICAL_CONTEXT_CHARS = 4_000;

/**
 * Aparo aplicado só na entrada da FILA — a escrita direta (caminho feliz,
 * esmagadora maioria) segue com a sequência inteira e com o snapshot inteiro.
 */
function trimForQueue(entry: OutboxEntry): OutboxEntry {
  if (entry.kind !== 'progress' && entry.kind !== 'abandonment') return entry;
  let trimmed = entry;

  if (trimmed.actions && trimmed.actions.length > MAX_QUEUED_TRACE_ACTIONS) {
    trimmed = {
      ...trimmed,
      actions: trimmed.actions.slice(0, MAX_QUEUED_TRACE_ACTIONS),
      actionsTruncated: true,
    };
  }

  if (trimmed.specSnapshot && !fitsIn(trimmed.specSnapshot.spec, MAX_QUEUED_SPEC_SNAPSHOT_CHARS)) {
    const { specSnapshot: _dropped, ...rest } = trimmed;
    trimmed = rest;
  }

  if (
    trimmed.pedagogicalContext &&
    !fitsIn(trimmed.pedagogicalContext, MAX_QUEUED_PEDAGOGICAL_CONTEXT_CHARS)
  ) {
    // Degrau 1 — cai só o `extra`. Os seis campos normalizados são o que a
    // Fase 4 consulta; o `extra` é a parte ilimitada e a menos usada hoje.
    const { extra: _extra, ...withoutExtra } = trimmed.pedagogicalContext;
    if (fitsIn(withoutExtra, MAX_QUEUED_PEDAGOGICAL_CONTEXT_CHARS)) {
      trimmed = { ...trimmed, pedagogicalContext: withoutExtra };
    } else {
      // Degrau 2 — nem sem o `extra` cabe. Sai inteiro: coluna NULL, que
      // significa "não capturado" e é a verdade. Descartado, nunca truncado,
      // pela mesma razão do snapshot — meio contexto é uma afirmação ERRADA
      // sobre o que a atividade exercitava, e uma afirmação errada é pior que
      // silêncio.
      const { pedagogicalContext: _context, ...rest } = trimmed;
      trimmed = rest;
    }
  }

  return trimmed;
}

/** Cabe na fila sem ameaçar a quota? Um valor que nem serializa também não cabe. */
function fitsIn(value: unknown, cap: number): boolean {
  try {
    return JSON.stringify(value).length <= cap;
  } catch {
    return false;
  }
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
  switch (entry.kind) {
    case 'progress':
      return `progress:${entry.activityId}`;
    case 'classAnswer':
      return `classAnswer:${entry.sessionId}:${entry.activityId}`;
    case 'abandonment':
      // ⚠️ NÃO inclui `startedAt` de propósito, e o alvo é DIFERENTE do
      // `progress:` da mesma atividade. As duas escolhas importam:
      //
      //  · Alvo próprio ⇒ um abandono nunca despeja da fila a RESPOSTA da mesma
      //    atividade (e vice-versa). Resposta de aluno e telemetria não disputam
      //    a mesma vaga; a regra da casa é que a telemetria jamais custa o
      //    registro que ela decora.
      //  · Sem o `startedAt` ⇒ no máximo UMA entrada de abandono por atividade,
      //    a mais recente vencendo, exatamente como o `progress`. Um aluno que
      //    abre e larga a mesma atividade cinco vezes offline enfileiraria cinco
      //    entradas, e as 200 vagas da fila são compartilhadas com respostas.
      //    Perder um abandono antigo do mesmo alvo é barato; perder uma resposta
      //    por causa dele não seria.
      return `abandonment:${entry.activityId}`;
  }
}

/**
 * Tira da fila uma escrita pendente pelo alvo. Devolve quantas saíram.
 *
 * Existe por UM motivo, e ele é de correção — ver `revokeQueuedAbandonment`.
 */
function revokeQueued(target: string): number {
  const queue = readOutbox();
  const kept = queue.filter((q) => targetOf(q.entry) !== target);
  if (kept.length === queue.length) return 0;
  write(kept);
  return queue.length - kept.length;
}

/**
 * CANCELA um abandono enfileirado para esta atividade.
 *
 * ⚠️ Chamado quando o aluno SETTLA a atividade, e é o que fecha a única corrida
 * capaz de custar dado real. O cenário:
 *
 *   1. o `pagehide` dispara e o beacon enfileira um abandono (origem T0);
 *   2. a página volta do bfcache — o `pagehide` não garantia teardown;
 *   3. o aluno responde, ainda na MESMA origem T0.
 *
 * Se o abandono já tivesse virado linha, o trace da resposta colidiria com ele
 * em `(user_id, activity_id, started_at)` e, como toda escrita de trace é
 * `ignoreDuplicates`, a SEQUÊNCIA DA RESPOSTA seria descartada em silêncio —
 * ficando no banco um abandono no lugar de uma tentativa de verdade. (Não dá
 * para resolver isso deixando a resposta sobrescrever: o GRANT da 0034 é só
 * `select, insert`, sem `update`, de propósito — ninguém pode reescrever o
 * registro de como resolveu algo.)
 *
 * A cura é não deixar o abandono chegar lá. Como o caminho de teardown NUNCA
 * escreve direto — só enfileira — a entrada ainda está na fila neste ponto, e
 * revogá-la é suficiente. O `activity_results` da resposta é uma escrita
 * separada e não é afetado em nenhuma hipótese.
 */
export function revokeQueuedAbandonment(activityId: string): number {
  return revokeQueued(`abandonment:${activityId}`);
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
