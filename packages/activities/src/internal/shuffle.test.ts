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

  it('leaves real answers alone', () => {
    expect(isReferenceLabelSet(opts('A', 'B', 'none of them'))).toBe(false);
    expect(isReferenceLabelSet(opts('h1', 'p'))).toBe(false);
    expect(isReferenceLabelSet(opts('A'))).toBe(false);
    expect(isReferenceLabelSet([{ id: 'x', label: 'A', image_url: 'a.png' }, { id: 'y', label: 'B' }])).toBe(false);
    expect(isReferenceLabelSet([{ id: 'x' }, { id: 'y' }])).toBe(false);
  });
});

describe('learnerOptionOrder', () => {
  it('keeps the authored order for reference labels, for every learner', () => {
    const options = opts('A', 'B', 'C', 'D', 'E');
    for (const scope of ['ana', 'bia', 'caio', 'duda']) {
      expect(learnerOptionOrder(options, scope, 'act-1').map((o) => o.label)).toEqual(['A', 'B', 'C', 'D', 'E']);
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
