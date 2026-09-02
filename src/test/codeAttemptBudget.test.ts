/**
 * O orçamento de tentativas do `code`, provado pela porta pública do pacote
 * (`@iterahq/activities/code`) — igual a `guidedCode.test.ts`, e pelo mesmo
 * motivo: `packages/` não tem runner próprio e o vitest da raiz só coleta
 * `src/**`.
 */
import { describe, it, expect } from 'vitest';
import {
  CODE_ATTEMPT_BUDGET,
  CODE_ATTEMPTS_KEY_PREFIX,
  attemptBudget,
  attemptNotice,
  codeAttemptsActivityId,
  codeAttemptsKey,
  grantAttempt,
  parseSpentAttempts,
  serializeSpentAttempts,
  spendAttempt,
} from '@iterahq/activities/code';

describe('parseSpentAttempts', () => {
  it('lê o placar que o depósito guardou', () => {
    expect(parseSpentAttempts('0')).toBe(0);
    expect(parseSpentAttempts('1')).toBe(1);
    expect(parseSpentAttempts('3')).toBe(3);
    expect(parseSpentAttempts(String(CODE_ATTEMPT_BUDGET))).toBe(CODE_ATTEMPT_BUDGET);
  });

  it('falha ABERTO: depósito ausente ou ilegível devolve o aluno com as vidas cheias', () => {
    // O erro simétrico é o caro — um `NaN` virando "sem vidas" tranca numa aula
    // ao vivo um exercício que ninguém tentou.
    for (const raw of [null, undefined, '', 'abc', '{}', 'NaN', 'Infinity', '-2']) {
      expect(parseSpentAttempts(raw)).toBe(0);
    }
  });

  it('grampeia no teto: editar o localStorage não compra tentativa', () => {
    expect(parseSpentAttempts('99')).toBe(CODE_ATTEMPT_BUDGET);
    expect(parseSpentAttempts('2.9')).toBe(2);
  });
});

// Derivado do orçamento, nunca cravado: o teto já subiu de 3 para 5 e um `2`
// literal aqui quebraria sem descrever regressão nenhuma.
describe('attemptBudget', () => {
  it('deriva o saldo dos envios errados já gastos', () => {
    expect(attemptBudget(0)).toEqual({
      spent: 0,
      remaining: CODE_ATTEMPT_BUDGET,
      exhausted: false,
    });
    expect(attemptBudget(1)).toEqual({
      spent: 1,
      remaining: CODE_ATTEMPT_BUDGET - 1,
      exhausted: false,
    });
    expect(attemptBudget(CODE_ATTEMPT_BUDGET - 1)).toEqual({
      spent: CODE_ATTEMPT_BUDGET - 1,
      remaining: 1,
      exhausted: false,
    });
  });

  it('a ÚLTIMA errada é terminal', () => {
    expect(attemptBudget(CODE_ATTEMPT_BUDGET)).toEqual({
      spent: CODE_ATTEMPT_BUDGET,
      remaining: 0,
      exhausted: true,
    });
  });

  it('não fica com saldo negativo por causa de um depósito adulterado', () => {
    expect(attemptBudget(50)).toEqual({
      spent: CODE_ATTEMPT_BUDGET,
      remaining: 0,
      exhausted: true,
    });
  });
});

describe('spendAttempt', () => {
  it('anda uma vida por envio errado', () => {
    expect(spendAttempt(0)).toBe(1);
    expect(spendAttempt(1)).toBe(2);
    expect(spendAttempt(CODE_ATTEMPT_BUDGET - 1)).toBe(CODE_ATTEMPT_BUDGET);
  });

  // O instrutor tirando vida cai NESTA conta, e é por isso que ela não tem irmã:
  // um `revokeAttempt` gêmeo divergiria no primeiro ajuste de teto.
  it('para no teto — gastar além do orçamento não é estado que exista', () => {
    expect(spendAttempt(CODE_ATTEMPT_BUDGET)).toBe(CODE_ATTEMPT_BUDGET);
    expect(spendAttempt(99)).toBe(CODE_ATTEMPT_BUDGET);
  });
});

describe('grantAttempt', () => {
  it('devolve UMA vida, inclusive para quem já estava trancado', () => {
    expect(grantAttempt(CODE_ATTEMPT_BUDGET)).toBe(CODE_ATTEMPT_BUDGET - 1);
    expect(grantAttempt(2)).toBe(1);
    expect(attemptBudget(grantAttempt(CODE_ATTEMPT_BUDGET)).exhausted).toBe(false);
  });

  it('não vira crédito acumulado em quem nunca errou', () => {
    expect(grantAttempt(0)).toBe(0);
  });

  it('conceder num depósito adulterado não escapa do teto', () => {
    expect(grantAttempt(99)).toBe(CODE_ATTEMPT_BUDGET - 1);
  });
});

describe('attemptNotice', () => {
  it('escolhe a chave do plural, que é onde o PT erra', () => {
    expect(attemptNotice(0)).toEqual({
      key: 'code.lives.remaining',
      count: CODE_ATTEMPT_BUDGET,
    });
    expect(attemptNotice(1)).toEqual({
      key: 'code.lives.remaining',
      count: CODE_ATTEMPT_BUDGET - 1,
    });
    expect(attemptNotice(CODE_ATTEMPT_BUDGET - 1)).toEqual({
      key: 'code.lives.remainingOne',
      count: 1,
    });
  });

  it('sem saldo o aviso muda de frase, não de número', () => {
    expect(attemptNotice(CODE_ATTEMPT_BUDGET)).toEqual({ key: 'code.lives.exhausted', count: 0 });
  });
});

describe('codeAttemptsKey', () => {
  it('cunha a chave e volta dela', () => {
    const key = codeAttemptsKey('act-1');
    expect(key).toBe(`${CODE_ATTEMPTS_KEY_PREFIX}act-1`);
    expect(codeAttemptsActivityId(key)).toBe('act-1');
  });

  it('não reivindica chave que este pacote não cunhou', () => {
    expect(codeAttemptsActivityId('itera.code.snapshot:act-1')).toBe('');
  });
});

describe('serializeSpentAttempts', () => {
  it('grava o mesmo número que a leitura vai aceitar de volta', () => {
    expect(serializeSpentAttempts(2)).toBe('2');
    expect(parseSpentAttempts(serializeSpentAttempts(2))).toBe(2);
    expect(serializeSpentAttempts(99)).toBe(String(CODE_ATTEMPT_BUDGET));
  });
});
