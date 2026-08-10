import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readCodeSnapshot, saveCodeSnapshot } from '@/services/codeSnapshot.service';
import { rememberStorageScope, scopedKey } from '@/utils/storageScope';

/**
 * O rascunho volta para a MESMA aula e não vaza para a próxima.
 *
 * `activityExecution.test.ts` prova as regras puras. Este arquivo prova o que o
 * aluno vive: escrever numa URL, recarregar noutra e ver (ou não ver) o
 * trabalho. A troca de URL é real (`history.pushState`) porque a execução é
 * lida do `location.pathname` no primeiro render — mockar o módulo provaria o
 * mock.
 */

const ACTIVITY = 'act-exec';
const LEARNER = 'aluno-1';

function go(pathname: string) {
  window.history.pushState({}, '', pathname);
}

describe('codeSnapshot — o rascunho é da execução', () => {
  beforeEach(() => {
    localStorage.clear();
    rememberStorageScope(LEARNER);
  });
  afterEach(() => {
    localStorage.clear();
    go('/');
  });

  it('devolve o trabalho num refresh da MESMA aula', () => {
    go('/live/s1');
    saveCodeSnapshot(ACTIVITY, 'const meu = 1;');
    expect(readCodeSnapshot(ACTIVITY)?.code).toBe('const meu = 1;');
  });

  it('a MESMA atividade nasce limpa numa aula NOVA', () => {
    go('/live/s1');
    saveCodeSnapshot(ACTIVITY, 'const turma_anterior = 1;');
    go('/live/s2');
    expect(readCodeSnapshot(ACTIVITY)).toBeNull();
  });

  it('rascunho de aula não invade o self-paced, nem o contrário', () => {
    go('/live/s1');
    saveCodeSnapshot(ACTIVITY, 'const naAula = 1;');
    go('/lesson/l-1');
    expect(readCodeSnapshot(ACTIVITY)).toBeNull();

    saveCodeSnapshot(ACTIVITY, 'const sozinho = 1;');
    expect(readCodeSnapshot(ACTIVITY)?.code).toBe('const sozinho = 1;');
    go('/live/s1');
    expect(readCodeSnapshot(ACTIVITY)).toBeNull();
  });

  it('duas visitas ao self-paced são a mesma execução', () => {
    go('/lesson/l-1');
    saveCodeSnapshot(ACTIVITY, 'const continua = 1;');
    go('/lesson/l-1');
    expect(readCodeSnapshot(ACTIVITY)?.code).toBe('const continua = 1;');
  });

  it('o convidado tem execução própria, separada do id da sessão', () => {
    go('/g/XPTO9');
    saveCodeSnapshot(ACTIVITY, 'const convidado = 1;');
    expect(readCodeSnapshot(ACTIVITY)?.code).toBe('const convidado = 1;');
    go('/g/OUTRO7');
    expect(readCodeSnapshot(ACTIVITY)).toBeNull();
  });

  it('rascunho SEM etiqueta continua voltando — deploy no meio da aula', () => {
    const key = scopedKey('itera.code.snapshot', ACTIVITY) as string;
    localStorage.setItem(
      key,
      JSON.stringify({ code: 'const legado = 1;', savedAt: '2026-08-06T10:00:00.000Z' })
    );
    go('/live/s1');
    expect(readCodeSnapshot(ACTIVITY)?.code).toBe('const legado = 1;');
  });

  it('o primeiro save sobrescreve o rascunho velho em disco', () => {
    go('/live/s1');
    saveCodeSnapshot(ACTIVITY, 'const antigo = 1;');
    go('/live/s2');
    saveCodeSnapshot(ACTIVITY, 'const novo = 1;');
    const key = scopedKey('itera.code.snapshot', ACTIVITY) as string;
    const parsed = JSON.parse(localStorage.getItem(key) as string);
    expect(parsed.code).toBe('const novo = 1;');
    expect(parsed.execution).toBe('live:s2');
    expect(readCodeSnapshot(ACTIVITY)?.code).toBe('const novo = 1;');
  });

  it('grava a etiqueta da execução no envelope', () => {
    go('/live/s9');
    saveCodeSnapshot(ACTIVITY, 'x');
    const key = scopedKey('itera.code.snapshot', ACTIVITY) as string;
    expect(JSON.parse(localStorage.getItem(key) as string).execution).toBe('live:s9');

    go('/lesson/l-2');
    saveCodeSnapshot(ACTIVITY, 'y');
    // `null`, e não a ausência da chave: self-paced é uma execução também.
    expect(JSON.parse(localStorage.getItem(key) as string).execution).toBeNull();
  });
});
