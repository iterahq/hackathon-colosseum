import { describe, it, expect, beforeEach } from 'vitest';
import {
  answerCountsAfterReset,
  clearLearnerLessonState,
  readLessonResetAt,
  storeLessonResetAt,
} from '@/utils/liveLessonReset';
import {
  readCodeSnapshot,
  readGuidedBlanks,
  saveCodeSnapshot,
  saveGuidedBlanks,
} from '@/services/codeSnapshot.service';
import { readStoredAnswer, storeAnswer } from '@/utils/liveAnswerStorage';
import { rememberStorageScope } from '@/utils/storageScope';

const LEARNER = 'aluno-reset';
const SESSION = 'sessao-reset';
const CUT = '2026-08-24T12:00:00.000Z';

beforeEach(() => {
  localStorage.clear();
  rememberStorageScope(LEARNER);
});

describe('answerCountsAfterReset', () => {
  it('sem corte, tudo conta', () => {
    expect(answerCountsAfterReset('2020-01-01T00:00:00.000Z', null)).toBe(true);
  });

  it('conta quem respondeu no instante do corte ou depois', () => {
    expect(answerCountsAfterReset(CUT, CUT)).toBe(true);
    expect(answerCountsAfterReset('2026-08-24T12:00:01.000Z', CUT)).toBe(true);
  });

  it('descarta quem respondeu antes do corte', () => {
    expect(answerCountsAfterReset('2026-08-24T11:59:59.000Z', CUT)).toBe(false);
  });

  it('sem created_at não conta — não dá pra provar que a resposta é nova', () => {
    expect(answerCountsAfterReset(null, CUT)).toBe(false);
    expect(answerCountsAfterReset(undefined, CUT)).toBe(false);
  });

  it('data ilegível conta — descartar por não saber ler esconderia resposta de aluno', () => {
    expect(answerCountsAfterReset('ontem', CUT)).toBe(true);
    expect(answerCountsAfterReset(CUT, 'ontem')).toBe(true);
  });
});

describe('o corte no disco do professor', () => {
  it('sobrevive ao refresh', () => {
    storeLessonResetAt(SESSION, CUT);
    expect(readLessonResetAt(SESSION)).toBe(CUT);
  });

  it('é por sessão — resetar uma aula não reseta a outra', () => {
    storeLessonResetAt(SESSION, CUT);
    expect(readLessonResetAt('outra-sessao')).toBeNull();
  });

  it('ignora lixo no lugar da data', () => {
    localStorage.setItem(`itera.live.reset:${LEARNER}:${SESSION}`, 'ontem');
    expect(readLessonResetAt(SESSION)).toBeNull();
  });
});

describe('clearLearnerLessonState', () => {
  it('esquece rascunho, blanks e resposta das atividades da lição', () => {
    saveCodeSnapshot('act-1', 'const a = 1;');
    saveGuidedBlanks('act-1', '["x"]');
    storeAnswer(SESSION, 'act-1', { correct: true, elapsedMs: 100 });

    clearLearnerLessonState(SESSION, ['act-1']);

    expect(readCodeSnapshot('act-1')).toBeNull();
    expect(readGuidedBlanks('act-1')).toBeNull();
    expect(readStoredAnswer(SESSION, 'act-1')).toBeNull();
  });

  it('não toca em atividade fora da lição resetada', () => {
    saveCodeSnapshot('act-2', 'const b = 2;');
    storeAnswer(SESSION, 'act-2', { correct: false, elapsedMs: 50 });

    clearLearnerLessonState(SESSION, ['act-1']);

    expect(readCodeSnapshot('act-2')?.code).toBe('const b = 2;');
    expect(readStoredAnswer(SESSION, 'act-2')?.correct).toBe(false);
  });

  it('sem atividades é no-op', () => {
    storeAnswer(SESSION, 'act-1', { correct: true, elapsedMs: 50 });
    clearLearnerLessonState(SESSION, []);
    expect(readStoredAnswer(SESSION, 'act-1')?.correct).toBe(true);
  });
});
