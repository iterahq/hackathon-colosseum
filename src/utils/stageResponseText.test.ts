import { describe, it, expect } from 'vitest';
import { stageResponseText, clampStageResponse } from './stageResponseText';

describe('stageResponseText', () => {
  it('deixa passar a resposta fechada — é o que o palco existe pra mostrar', () => {
    expect(stageResponseText('single_choice', 'git add .')).toBe('git add .');
    expect(stageResponseText('order', 'add → commit → push')).toBe('add → commit → push');
    expect(stageResponseText('match', 'commit ↔ salvar')).toBe('commit ↔ salvar');
  });

  // A reflexão é escrita PRO PROFESSOR. Projetar na parede é outro produto.
  it('não projeta texto livre de reflexão', () => {
    expect(stageResponseText('document', 'eu me senti perdido na aula de hoje')).toBeUndefined();
    expect(stageResponseText('concept', 'qualquer coisa')).toBeUndefined();
  });

  it('corta o que não cabe num projetor', () => {
    const long = 'a'.repeat(500);
    expect(stageResponseText('quiz', long)!.length).toBe(281);
  });
});

describe('clampStageResponse', () => {
  it('descarta o que não é texto — a string chega pela rede', () => {
    expect(clampStageResponse({ oops: true })).toBeUndefined();
    expect(clampStageResponse('   ')).toBeUndefined();
    expect(clampStageResponse(undefined)).toBeUndefined();
  });
});
