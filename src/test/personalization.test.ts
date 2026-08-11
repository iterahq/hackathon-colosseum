/**
 * A substituição por preenchimento — a via SEM modelo do conteúdo com a cara do
 * aluno. Estes testes cobrem o que o BYOC gerativo não consegue prometer:
 * determinismo, e um texto que nunca inventa um fato sobre a família de
 * ninguém.
 */
import { describe, expect, it } from 'vitest';
import { resources } from '@/i18n';
import {
  PERSONALIZATION_FIELDS,
  fillTokens,
  missingFields,
  personalizeSpec,
  sanitizePersonalizationInput,
  sanitizePersonalizationValue,
  tokensIn,
  tokensInSpec,
} from '@/utils/personalization';

describe('sanitizePersonalizationValue', () => {
  it('mantém letra com acento, espaço e hífen', () => {
    expect(sanitizePersonalizationValue('Maria Ávila-Souza')).toBe('Maria Ávila-Souza');
  });

  it("apóstrofo vira ’ — senão o sobrenome do aluno quebra o starter de `code`", () => {
    expect(sanitizePersonalizationValue("Sant'Ana")).toBe('Sant’Ana');
    expect(fillTokens("nome = '{{eu.nome}}'", { 'eu.nome': "O'Brien" })).toBe("nome = 'O’Brien'");
  });

  it('tira marcação — o valor do aluno é TEXTO, nunca negrito nem código', () => {
    expect(sanitizePersonalizationValue('**Ana**')).toBe('Ana');
    expect(sanitizePersonalizationValue('`código`')).toBe('código');
  });

  it('fecha o vetor de atributo: aspas, < e > não sobrevivem', () => {
    expect(sanitizePersonalizationValue('" onerror="alert(1)')).toBe('onerroralert1');
    expect(sanitizePersonalizationValue('<img src=x>')).toBe('img srcx');
  });

  it('idade é só dígito', () => {
    expect(sanitizePersonalizationValue('42 anos', 'age')).toBe('42');
  });

  it('tem teto de tamanho — nome não vira parágrafo', () => {
    expect(sanitizePersonalizationValue('a'.repeat(200))).toHaveLength(40);
  });

  it('`phrase` cabe uma frase — 40 cortaria "consertar bicicleta de corrida" no meio', () => {
    expect(sanitizePersonalizationValue('a'.repeat(200), 'phrase')).toHaveLength(80);
    expect(sanitizePersonalizationValue('consertar bicicleta de corrida', 'phrase')).toBe(
      'consertar bicicleta de corrida'
    );
  });
});

describe('sanitizePersonalizationInput — nome composto tem que ser digitável', () => {
  it('deixa o espaço do fim sobreviver enquanto se digita', () => {
    // Saneando a cada tecla com o `.trim()`, "Ana " virava "Ana" e a próxima
    // letra grudava: "AnaMaria".
    expect(sanitizePersonalizationInput('Ana ')).toBe('Ana ');
    expect(sanitizePersonalizationInput('Ana Maria')).toBe('Ana Maria');
  });

  it('não deixa começar por espaço nem acumular espaço', () => {
    expect(sanitizePersonalizationInput('   ')).toBe('');
    expect(sanitizePersonalizationInput('Ana    ')).toBe('Ana ');
  });

  it('o espaço extra não fura o teto', () => {
    expect(sanitizePersonalizationInput('a'.repeat(40) + ' ')).toHaveLength(40);
  });

  it('mantém a limpeza do saneador normal', () => {
    expect(sanitizePersonalizationInput('**Ana** ')).toBe('Ana ');
    expect(sanitizePersonalizationInput('42 anos ', 'age')).toBe('42');
  });
});

describe('tokens', () => {
  it('acha só id do vocabulário, em ordem e sem repetir', () => {
    expect(tokensIn('{{familiar.nome}} e {{familiar.nome}} com {{eu.nome}}')).toEqual([
      'familiar.nome',
      'eu.nome',
    ]);
  });

  it('ignora id que não existe', () => {
    expect(tokensIn('{{vizinho.nome}}')).toEqual([]);
  });

  it('varre o spec em qualquer profundidade', () => {
    const spec = { prompt: 'oi', options: [{ text: '{{amigo.nome}}' }] };
    expect(tokensInSpec(spec)).toEqual(['amigo.nome']);
  });
});

describe('fillTokens', () => {
  it('troca pelo valor do aluno', () => {
    expect(fillTokens('Oi, {{familiar.nome}}!', { 'familiar.nome': 'Cida' })).toBe('Oi, Cida!');
  });

  it('sem valor, usa o fallback — a frase nunca fica mutilada', () => {
    expect(fillTokens('Oi, {{familiar.nome}}!', {})).toBe('Oi, Ana!');
  });

  it('token desconhecido sobrevive VERBATIM — erro de autoria fica visível', () => {
    expect(fillTokens('Oi, {{vizinho.nome}}!', {})).toBe('Oi, {{vizinho.nome}}!');
  });

  it('sanitiza de novo na hora de trocar: valor sujo do banco não vira marcação', () => {
    expect(fillTokens('{{eu.nome}}', { 'eu.nome': '**Sam**' })).toBe('Sam');
  });
});

describe('personalizeSpec', () => {
  it('devolve o MESMO objeto quando não há token — zero custo por atividade', () => {
    const spec = { prompt: 'sem token' };
    expect(personalizeSpec(spec, {})).toBe(spec);
  });

  it('troca em string aninhada e preserva o que não é string', () => {
    const spec = {
      prompt: '{{familiar.parentesco}} tem {{familiar.idade}} anos',
      options: [{ text: '{{familiar.nome}}', isCorrect: true }],
      limit: 3,
    };
    expect(personalizeSpec(spec, { 'familiar.nome': 'Cida', 'familiar.idade': '51' })).toEqual({
      prompt: 'mãe tem 51 anos',
      options: [{ text: 'Cida', isCorrect: true }],
      limit: 3,
    });
  });
});

describe('missingFields', () => {
  it('pede só o que ESTA atividade cita', () => {
    const spec = { prompt: '{{familiar.nome}} e {{amigo.nome}}' };
    expect(missingFields(spec, { 'familiar.nome': 'Cida' }).map((f) => f.id)).toEqual([
      'amigo.nome',
    ]);
  });

  it('não pede nada quando o spec não cita ninguém', () => {
    expect(missingFields({ prompt: 'oi' }, {})).toEqual([]);
  });
});

describe('vocabulário', () => {
  it('todo campo tem rótulo nos dois idiomas — sem isso o aluno lê a chave crua', () => {
    for (const field of PERSONALIZATION_FIELDS) {
      for (const locale of ['pt', 'en'] as const) {
        expect(resources[locale][`personalization.field.${field.labelKey}`]).toBeTruthy();
      }
    }
  });

  it('o check de um `code` grada contra o valor do próprio aluno', () => {
    const spec = {
      prompt: 'declare `profissao`',
      checks: [{ id: 'p', label: 'mostra a profissão', selector: '#p', assert: { type: 'text', contains: '{{eu.profissao}}' } }],
    };
    expect(personalizeSpec(spec, { 'eu.profissao': 'mecânica' })).toEqual({
      prompt: 'declare `profissao`',
      checks: [{ id: 'p', label: 'mostra a profissão', selector: '#p', assert: { type: 'text', contains: 'mecânica' } }],
    });
  });
});
