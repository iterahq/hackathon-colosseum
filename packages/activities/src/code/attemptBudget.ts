/**
 * O ORÇAMENTO DE TENTATIVAS do kind `code`, puro.
 *
 * Samuel, depois de uma aula ao vivo: *"quando o usuário envia ao errar,
 * aparecem quantas vezes for preciso as dicas e ele pode enviar quantas quiser.
 * Colocar um limite de vidas por exercício — 3 a princípio."* Sem teto, a dica
 * autorada (`checks[].hint`, `blanks[].hint`) deixa de ser dica e vira o
 * gabarito servido em fatias: tentar de novo custa nada, então a estratégia
 * vencedora é chutar até a tela ficar verde — e o dado de acerto para de
 * descrever aprendizagem.
 *
 * Os kinds de ESCOLHA não passam por aqui, e não é esquecimento: em
 * `internal/answerMachine.ts` um envio já tranca a atividade
 * (`locked = submitted || done || reveal`), então lá o orçamento sempre foi 1.
 * Este módulo existe porque o `code` tem caminho próprio — submeter, ver
 * veredito, voltar a editar — e era o único onde o ciclo não fechava.
 *
 * Fora do React de propósito: cada regra abaixo é valor-entra/valor-sai, e é o
 * que permite provar "a terceira errada é terminal" sem montar um editor.
 */

/**
 * Quantos envios ERRADOS o aluno pode gastar antes de a atividade fechar como
 * errada. Três, e não um: o `code` erra por vírgula tanto quanto por conceito, e
 * uma tentativa só transformaria digitação em veredito. Constante, e não campo
 * de `CodeSpec` — o schema é validado fail-closed e um campo novo obriga toda
 * activity já autorada a ganhar valor; quando houver evidência de que 3 é pouco
 * ou muito, o número muda aqui, num lugar só.
 */
export const CODE_ATTEMPT_BUDGET = 3;

/** Prefixo da chave que o `code` entrega ao `ActivityStoragePort` para o placar. */
export const CODE_ATTEMPTS_KEY_PREFIX = 'itera.code.attempts:';

/**
 * O contador mora no MESMO depósito do rascunho, e por isso ganha uma terceira
 * chave em vez de um campo dentro de uma das duas que já existem: a porta é
 * `(key, value: string)` — ver `./draftKey.ts` — então o pacote não pode ditar o
 * envelope do host. Um host que ignore a porta cai no localStorage do próprio
 * pacote, numa chave da mesma família e sem colidir com a versão escopada por
 * aluno que o Player usa.
 */
export function codeAttemptsKey(activityId: string): string {
  return `${CODE_ATTEMPTS_KEY_PREFIX}${activityId}`;
}

/** O inverso; `''` para uma chave que este pacote não cunhou. */
export function codeAttemptsActivityId(key: string): string {
  return key.startsWith(CODE_ATTEMPTS_KEY_PREFIX) ? key.slice(CODE_ATTEMPTS_KEY_PREFIX.length) : '';
}

export interface AttemptBudget {
  spent: number;
  remaining: number;
  exhausted: boolean;
}

/**
 * Quantas tentativas o depósito diz que já foram gastas.
 *
 * FAIL-OPEN, e é decisão de produto: um depósito ausente, ilegível, negativo ou
 * editado à mão vira `0`, ou seja, o aluno reabre com as três vidas. O erro caro
 * aqui é o simétrico — um `NaN` virar "sem vidas" tranca numa aula ao vivo um
 * exercício que a pessoa nem tentou, e ninguém consegue destravar de dentro da
 * sala. Já o teto é rígido: um valor acima do orçamento é grampeado, senão
 * bastaria editar o localStorage para ganhar tentativas.
 */
export function parseSpentAttempts(raw: string | null | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(Math.floor(parsed), CODE_ATTEMPT_BUDGET);
}

export function serializeSpentAttempts(spent: number): string {
  return String(parseSpentAttempts(String(spent)));
}

export function attemptBudget(spent: number): AttemptBudget {
  const safe = parseSpentAttempts(String(spent));
  return {
    spent: safe,
    remaining: CODE_ATTEMPT_BUDGET - safe,
    exhausted: safe >= CODE_ATTEMPT_BUDGET,
  };
}

/** Grampeado no teto: gastar além do orçamento não é estado que exista. */
export function spendAttempt(spent: number): number {
  return Math.min(parseSpentAttempts(String(spent)) + 1, CODE_ATTEMPT_BUDGET);
}

/**
 * Qual frase o aluno lê sobre o próprio saldo.
 *
 * A escolha é pura porque é ela que erra: plural em português não é `s` no fim
 * de uma string interpolada, e duas telas (guiado e checks) mostram o mesmo
 * saldo — decidir a chave em cada componente é como as duas divergem.
 */
export function attemptNotice(spent: number): { key: string; count: number } {
  const { remaining, exhausted } = attemptBudget(spent);
  if (exhausted) return { key: 'code.lives.exhausted', count: 0 };
  return {
    key: remaining === 1 ? 'code.lives.remainingOne' : 'code.lives.remaining',
    count: remaining,
  };
}
