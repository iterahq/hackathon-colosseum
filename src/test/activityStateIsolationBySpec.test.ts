import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedCodeSource, codeBlanksDraftKey, codeDraftKey } from '@iterahq/activities/code';
import { ITERA_ACTIVITY_STORAGE } from '@/components/branded/activity/IteraActivityHost';
import {
  readCodeSnapshot,
  readGuidedBlanks,
  saveCodeSnapshot,
  saveGuidedBlanks,
} from '@/services/codeSnapshot.service';
import { readStoredAnswer, storeAnswer } from '@/utils/liveAnswerStorage';
import { rememberStorageScope } from '@/utils/storageScope';

/**
 * A GARANTIA QUE NINGUÉM ESCREVEU.
 *
 * O Tainan reportou, depois de uma aula no Educar+: *"quando eu inicio uma
 * atividade que eu já fiz em outro curso, mas ela é igual, ela já vem
 * respondida"*. A investigação de 2026-08-24 fechou o diagnóstico: nada no app
 * nem no Postgres casa atividade por CONTEÚDO — `progress` e `activity_results`
 * são por (user_id, activity_id), `class_answers` tem PK
 * (session_id, activity_id, user_id) e toda chave de localStorage é
 * `scopedKey(prefix, activityId)`. O que ele viu foi conteúdo DUPLICADO (30+
 * pares de `spec` byte-a-byte idêntico em lições e programas diferentes) sem
 * caminho de "refazer" — e não estado compartilhado.
 *
 * Só que isso era garantia por acidente: nenhum teste provava. Este arquivo é a
 * prova. Duas atividades com o MESMO `spec` e ids diferentes; se alguém trocar
 * qualquer uma das chaves por algo derivado do conteúdo — hash do spec, título,
 * ordinal, `starter` —, as duas passam a colidir e todos os casos abaixo
 * quebram, em vez de a sala de aula descobrir.
 */

const LEARNER = 'aluno-isolamento';
const SESSION = 'sessao-isolamento';

/** O `spec` compartilhado: byte-a-byte igual nas duas atividades, de propósito. */
const SHARED_SPEC = {
  prompt: 'Some os dois números',
  title: 'Soma',
  starter: 'function soma(a, b) {\n  // seu código\n}\n',
  template: 'function soma(a, b) {\n  return {{op}};\n}\n',
};

const A = 'act-a-primeiro-curso';
const B = 'act-b-outro-programa';

const specJson = () => JSON.stringify(SHARED_SPEC);

beforeEach(() => {
  localStorage.clear();
  rememberStorageScope(LEARNER);
});
afterEach(() => localStorage.clear());

describe('o estado do aluno é isolado por ID DE ATIVIDADE, nunca por conteúdo', () => {
  it('spec idêntico é de fato idêntico — se não for, este arquivo não prova nada', () => {
    expect(specJson()).toBe(specJson());
    expect(A).not.toBe(B);
  });

  it('rascunho de código de A não vaza para B (quebra se a chave virar hash do spec)', () => {
    saveCodeSnapshot(A, 'const feitoNaPrimeiraAtividade = true;');

    expect(readCodeSnapshot(B)).toBeNull();
    expect(readCodeSnapshot(A)?.code).toBe('const feitoNaPrimeiraAtividade = true;');
  });

  it('blanks guiados de A não vazam para B (quebra se a chave virar título ou ordinal)', () => {
    saveGuidedBlanks(A, JSON.stringify({ op: 'a + b' }));

    expect(readGuidedBlanks(B)).toBeNull();
    expect(readGuidedBlanks(A)).toBe(JSON.stringify({ op: 'a + b' }));
  });

  it('resposta de aula ao vivo de A não vaza para B (quebra se a chave virar o spec)', () => {
    storeAnswer(SESSION, A, { correct: true, elapsedMs: 4200 });

    expect(readStoredAnswer(SESSION, B)).toBeNull();
    expect(readStoredAnswer(SESSION, A)?.correct).toBe(true);
  });

  it('B abre no starter puro, com hasWork=false, depois de A ter sido preenchida', () => {
    saveCodeSnapshot(A, 'function soma(a, b) {\n  return a + b;\n}\n');

    const seededB = seedCodeSource(ITERA_ACTIVITY_STORAGE, B, SHARED_SPEC.starter);
    expect(seededB).toEqual({ code: SHARED_SPEC.starter, hasWork: false });

    // E a recíproca, senão o teste passaria com um `seedCodeSource` que nunca lê
    // nada: A tem que continuar devolvendo o trabalho do aluno.
    const seededA = seedCodeSource(ITERA_ACTIVITY_STORAGE, A, SHARED_SPEC.starter);
    expect(seededA).toEqual({ code: 'function soma(a, b) {\n  return a + b;\n}\n', hasWork: true });
  });

  it('as chaves em disco carregam o ID da atividade, e nada do conteúdo', () => {
    saveCodeSnapshot(A, 'x');
    saveGuidedBlanks(A, '{}');
    storeAnswer(SESSION, A, { correct: false, elapsedMs: 1 });

    const keys = Object.keys(localStorage);
    expect(keys).toContain(`itera.code.snapshot:${LEARNER}:${A}`);
    expect(keys).toContain(`itera.code.blanks:${LEARNER}:${A}`);
    expect(keys).toContain(`itera.live.answers:${LEARNER}:${SESSION}`);

    // Nenhuma chave pode conter conteúdo do spec: título, enunciado ou starter
    // numa chave significa que duas atividades iguais dividem o mesmo slot.
    const contentBits = [SHARED_SPEC.title, SHARED_SPEC.prompt, SHARED_SPEC.starter];
    for (const key of keys) {
      for (const bit of contentBits) expect(key).not.toContain(bit);
    }

    // O que o pacote `@iterahq/activities/code` pede ao host também é por id.
    expect(codeDraftKey(A)).not.toBe(codeDraftKey(B));
    expect(codeBlanksDraftKey(A)).not.toBe(codeBlanksDraftKey(B));
  });
});
