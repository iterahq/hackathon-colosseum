/**
 * O TERCEIRO SLOT do `code`: quantos envios errados o aluno já gastou.
 *
 * O orçamento em si é do pacote (`@iterahq/activities/code` →
 * `attemptBudget.ts`); daqui sai só onde ele mora no disco desta máquina. Slot
 * próprio, e não mais um campo no envelope do rascunho, porque
 * `ActivityStoragePort` é `(key, value: string)` de propósito — o pacote nomeia
 * a chave, o host decide o depósito (ver `code/draftKey.ts`).
 *
 * ESCOPADO POR ALUNO (`scopedKey`) pelo motivo de sempre: as máquinas do
 * Educar+ são compartilhadas, e um placar sem escopo trancaria o exercício do
 * próximo aluno com as tentativas do anterior.
 *
 * ⚠️ ETIQUETADO POR EXECUÇÃO, como as duas metades do rascunho. É isso que
 * separa "não dá pra recuperar vida com F5" de "a lição nunca mais abre": dentro
 * da mesma aula o contador sobrevive à recarga; uma aula NOVA nasce com o
 * orçamento cheio, senão repetir a lição na turma seguinte entregaria o
 * exercício já perdido.
 *
 * SEM `CODE_SNAPSHOT_EVENT`: gastar tentativa não é "trabalho em andamento", e
 * disparar aqui faria o seletor do professor piscar a cada envio.
 */
import { scopedKey } from '@/utils/storageScope';
import { belongsToExecution, currentExecutionId } from '@/utils/activityExecution';
import {
  CODE_ATTEMPTS_REFRESH_EVENT,
  attemptBudget,
  grantAttempt,
  parseSpentAttempts,
  serializeSpentAttempts,
  spendAttempt,
} from '@iterahq/activities/code';

const keyFor = (activityId: string) => scopedKey('itera.code.attempts', activityId);

/** A contagem crua que o pacote gravou — a leitura dele é fail-open. */
export function readCodeAttempts(activityId: string): string | null {
  if (!activityId) return null;
  const key = keyFor(activityId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== 'object') return null;
    const envelope = parsed as { spent?: string; execution?: string | null };
    if (typeof envelope.spent !== 'string') return null;
    if (!belongsToExecution(envelope.execution, currentExecutionId())) return null;
    return envelope.spent;
  } catch {
    return null;
  }
}

export function saveCodeAttempts(activityId: string, spent: string): void {
  if (!activityId) return;
  const key = keyFor(activityId);
  if (!key) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ spent, savedAt: new Date().toISOString(), execution: currentExecutionId() }),
    );
  } catch {
    // Storage indisponível — o teto passa a valer só nesta aba, que é a
    // degradação certa: o exercício continua jogável.
  }
}

/**
 * Move o saldo em UMA vida e avisa a tela na mesma hora.
 *
 * Grava pelo `saveCodeAttempts` para reetiquetar a execução: uma vida mexida
 * hoje não pode ressuscitar um placar de uma aula anterior que o
 * `belongsToExecution` já estava descartando.
 *
 * As duas pontas são grampeadas pelo pacote — conceder não passa de zero gasto,
 * tirar não passa do orçamento —, então o instrutor não consegue nem criar
 * crédito infinito nem cavar um saldo negativo com o dedo preso no botão.
 */
function moveCodeAttempt(activityId: string, next: (spent: number) => number): void {
  if (!activityId) return;
  saveCodeAttempts(
    activityId,
    serializeSpentAttempts(next(parseSpentAttempts(readCodeAttempts(activityId)))),
  );
  try {
    window.dispatchEvent(new CustomEvent(CODE_ATTEMPTS_REFRESH_EVENT, { detail: { activityId } }));
  } catch {
    // Sem window (SSR/teste) — o próximo mount relê o depósito de qualquer jeito.
  }
}

/** +1 vida. */
export function grantCodeAttempt(activityId: string): void {
  moveCodeAttempt(activityId, grantAttempt);
}

/**
 * −1 vida. É literalmente um envio errado debitado pelo instrutor, então usa a
 * MESMA conta do `spendAttempt`: um `revokeAttempt` gêmeo divergiria no
 * primeiro ajuste de teto.
 */
export function revokeCodeAttempt(activityId: string): void {
  moveCodeAttempt(activityId, spendAttempt);
}

/**
 * When this learner spent their last life on the exercise, on this device, in
 * ms — or `null` while lives remain. The budget is stamped on every spend, so
 * the stamp of an exhausted budget is the instant of the final miss.
 */
export function codeBudgetSpentAt(activityId: string): number | null {
  if (!attemptBudget(parseSpentAttempts(readCodeAttempts(activityId))).exhausted) return null;
  const key = keyFor(activityId);
  try {
    const raw = key ? localStorage.getItem(key) : null;
    const savedAt = raw ? Date.parse((JSON.parse(raw) as { savedAt?: string }).savedAt ?? '') : NaN;
    return Number.isFinite(savedAt) ? savedAt : Date.now();
  } catch {
    return Date.now();
  }
}

export function clearCodeAttempts(activityId: string): void {
  if (!activityId) return;
  const key = keyFor(activityId);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage indisponível — não há o que limpar.
  }
}
