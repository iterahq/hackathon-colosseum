import { describe, expect, it } from 'vitest';
import { isReferenceLabelSet, learnerOptionOrder } from './shuffle.js';

const opts = (...labels: string[]) => labels.map((label, i) => ({ id: `o${i}`, label }));

describe('isReferenceLabelSet', () => {
  it('recognises letter and number labels that only point at blocks of the prompt', () => {
    expect(isReferenceLabelSet(opts('A', 'B', 'C'))).toBe(true);
    expect(isReferenceLabelSet(opts('**A**', '**B**'))).toBe(true);
    expect(isReferenceLabelSet(opts('(a)', 'b)', 'c.'))).toBe(true);
    expect(isReferenceLabelSet(opts('1', '2', '3'))).toBe(true);
  });

  const lists = 'One list is wrong.\n\n**Lista A**\n```\n<ul>\n```\n**Lista B**\n```\n<ol>\n```\n**Lista C**\n```\n<dl>\n```';

  it('recognises reference labels named after blocks the prompt shows', () => {
    expect(isReferenceLabelSet(opts('Lista A', 'Lista B', 'Lista C'), lists)).toBe(true);
    expect(isReferenceLabelSet(opts('lista b', 'lista a', 'lista c'), lists)).toBe(true);
    expect(isReferenceLabelSet(opts('**Opção 1**', '**Opção 2**'), 'Compare a opção 1 com a opção 2.')).toBe(true);
    expect(isReferenceLabelSet(opts('Código a)', 'Código b)'), 'Código A roda. Código B não.')).toBe(true);
  });

  it('still shuffles named labels that are answers, not pointers', () => {
    expect(isReferenceLabelSet(opts('Classe A', 'Classe B', 'Classe C'), 'De que classe é o IP 10.0.0.1?')).toBe(false);
    expect(isReferenceLabelSet(opts('Nível 1', 'Nível 2', 'Nível 3'), 'Em que nível fica o título?')).toBe(false);
    expect(isReferenceLabelSet(opts('Lista A', 'Lista B', 'Lista C'))).toBe(false);
    expect(isReferenceLabelSet(opts('Lista A', 'Lista B'), lists.replace('**Lista B**', ''))).toBe(false);
    expect(isReferenceLabelSet(opts('React 18', 'React 19'), 'React 18 ou React 19?')).toBe(false);
    expect(isReferenceLabelSet(opts('Tipo A', 'Classe B'), 'Tipo A e Classe B.')).toBe(false);
    expect(isReferenceLabelSet(opts('Lista A', 'Lista C'), lists)).toBe(false);
    expect(isReferenceLabelSet(opts('Lista A', 'B'), lists)).toBe(false);
  });

  it('leaves real answers alone', () => {
    expect(isReferenceLabelSet(opts('A', 'B', 'none of them'))).toBe(false);
    expect(isReferenceLabelSet(opts('h1', 'p'))).toBe(false);
    expect(isReferenceLabelSet(opts('A'))).toBe(false);
    const withImage = [{ id: 'x', label: 'A', image_url: 'a.png' }, { id: 'y', label: 'B' }];
    const unlabelled: { id: string; label?: string }[] = [{ id: 'x' }, { id: 'y' }];
    expect(isReferenceLabelSet(withImage)).toBe(false);
    expect(isReferenceLabelSet(unlabelled)).toBe(false);
  });
});

describe('learnerOptionOrder', () => {
  it('keeps the authored order for reference labels, for every learner', () => {
    const options = opts('A', 'B', 'C', 'D', 'E');
    for (const scope of ['ana', 'bia', 'caio', 'duda']) {
      expect(learnerOptionOrder(options, scope, 'act-1').map((o) => o.label)).toEqual(['A', 'B', 'C', 'D', 'E']);
    }
  });

  it('keeps the authored order when the options are named after the blocks', () => {
    const options = opts('Lista A', 'Lista B', 'Lista C');
    const prompt = '**Lista A** … **Lista B** … **Lista C** … Qual lista fecha na ordem errada?';
    for (const scope of ['ana', 'bia', 'caio', 'duda']) {
      expect(learnerOptionOrder(options, scope, 'act-1', prompt).map((o) => o.label)).toEqual(['Lista A', 'Lista B', 'Lista C']);
    }
  });

  it('still shuffles real answers per learner', () => {
    const options = opts('red', 'green', 'blue', 'yellow', 'purple', 'orange');
    const orders = new Set(
      ['ana', 'bia', 'caio', 'duda', 'enzo'].map((scope) =>
        learnerOptionOrder(options, scope, 'act-1').map((o) => o.label).join(),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});
