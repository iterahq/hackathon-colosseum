import { describe, it, expect } from 'vitest';
import { belongsToExecution, executionFromPath } from './activityExecution';

describe('executionFromPath', () => {
  it('lê a aula ao vivo do caminho', () => {
    expect(executionFromPath('/live/abc-123')).toBe('live:abc-123');
    expect(executionFromPath('/live/abc-123?como=aluno')).toBe('live:abc-123');
  });

  it('lê o link de convidado, com prefixo próprio', () => {
    // Prefixo separado para um código curto nunca ser confundido com um sessionId.
    expect(executionFromPath('/g/XPTO9')).toBe('guest:XPTO9');
  });

  it('self-paced, autoria e harness não são execução ao vivo', () => {
    expect(executionFromPath('/lesson/l-1')).toBeNull();
    expect(executionFromPath('/author/activities/a-1/test')).toBeNull();
    expect(executionFromPath('/')).toBeNull();
  });
});

describe('belongsToExecution', () => {
  it('o rascunho da MESMA aula volta (refresh, queda de rede)', () => {
    expect(belongsToExecution('live:s1', 'live:s1')).toBe(true);
  });

  it('o rascunho de OUTRA aula não volta — a atividade nasce limpa', () => {
    expect(belongsToExecution('live:s1', 'live:s2')).toBe(false);
    expect(belongsToExecution('live:s1', null)).toBe(false);
    expect(belongsToExecution(null, 'live:s1')).toBe(false);
  });

  it('duas visitas ao self-paced são a mesma execução', () => {
    expect(belongsToExecution(null, null)).toBe(true);
  });

  it('rascunho SEM etiqueta passa — não apagar trabalho de quem está com aula aberta no deploy', () => {
    expect(belongsToExecution(undefined, 'live:s1')).toBe(true);
    expect(belongsToExecution(undefined, null)).toBe(true);
  });
});
