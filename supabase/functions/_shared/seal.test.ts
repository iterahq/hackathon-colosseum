import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { gradeSubmission, type HtmlParser } from './grading.ts';
import { answerKey, sealActivity, sealedId, unsealAnswer } from './seal.ts';

const SECRET = 'test-secret';
const parseHtml: HtmlParser = (source) => {
  const { document } = new JSDOM(source).window;
  return {
    count: (selector) => document.querySelectorAll(selector).length,
    text: (selector) => document.querySelector(selector)?.textContent ?? null,
    attr: (selector, name) => document.querySelector(selector)?.getAttribute(name) ?? null,
  };
};

const single = {
  id: 'act-1',
  kind: 'single_choice',
  spec: {
    instruction: { text: 'Which tag is the heading?' },
    options: [{ id: 'certo', label: '<h1>' }, { id: 'p', label: '<p>' }, { id: 'ul', label: '<ul>' }],
    correct_option_id: 'certo',
    explanation: { pt: 'O h1 é o título.', en: 'The h1 is the heading.' },
  },
};
const order = {
  id: 'act-2',
  kind: 'order',
  spec: { items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], correct_order: ['a', 'b', 'c'], explanation: 'a, b, c' },
};
const match = {
  id: 'act-3',
  kind: 'match',
  spec: {
    left: [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }],
    right: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }],
    pairs: [{ left_id: 'l1', right_id: 'r1' }, { left_id: 'l2', right_id: 'r2' }, { left_id: 'l3', right_id: 'r3' }],
  },
};
const bank = {
  id: 'act-4',
  kind: 'code_fill_bank',
  spec: {
    language: 'html',
    starter: '<{{blank:a}}>Oi</{{blank:b}}>',
    blanks: [{ id: 'a', kind: 'bank', answer: 'h1', options: ['h7'] }, { id: 'b', kind: 'bank', answer: 'h1' }],
  },
};
const select = {
  id: 'act-5',
  kind: 'code_fill_select',
  spec: { language: 'html', starter: '<{{blank:a}}>', blanks: [{ id: 'a', kind: 'select', answer: 'p', options: ['div', 'span'], accept: ['P'] }] },
};
const checks = {
  id: 'act-6',
  kind: 'code_editor_checks',
  spec: {
    language: 'html',
    starter: '<h1>Oi</h1>',
    checks: [{ id: 'one', label: 'One h2', hint: 'Use h2', selector: 'body > h2', assert: { type: 'count', equals: 1 } }],
  },
};
const styled = {
  id: 'act-7',
  kind: 'code_editor_checks',
  spec: { language: 'html', starter: '<p>Oi</p>', checks: [{ id: 'c', selector: 'p', assert: { type: 'style', property: 'color', equals: 'red' } }] },
};

const text = (value: unknown) => JSON.stringify(value);

describe('sealActivity', () => {
  it('removes the key, the explanation and the authored ids of a choice', () => {
    const sealed = sealActivity(single, SECRET);
    expect(sealed).toMatchObject({ sealed: true, graded_by: 'server' });
    expect(text(sealed.spec)).not.toMatch(/correct_option_id|explanation|certo/);
    const ids = (sealed.spec as { options: Array<{ id: string }> }).options.map((option) => option.id);
    expect(ids.sort()).toEqual(['certo', 'p', 'ul'].map((id) => sealedId(SECRET, 'act-1', id)).sort());
  });

  it('keeps the order of options that are only letters of the prompt', () => {
    const lettered = { ...single, spec: { ...single.spec, options: [{ id: 'x', label: 'A' }, { id: 'y', label: 'B' }, { id: 'z', label: 'C' }], correct_option_id: 'y' } };
    const labels = (sealActivity(lettered, SECRET).spec as { options: Array<{ label: string }> }).options.map((option) => option.label);
    expect(labels).toEqual(['A', 'B', 'C']);
  });

  it('never hands an order activity over already in order', () => {
    for (const id of ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8']) {
      const sealed = sealActivity({ ...order, id }, SECRET);
      const shown = (sealed.spec as { items: Array<{ id: string }> }).items.map((item) => item.id);
      expect(shown).not.toEqual(['a', 'b', 'c'].map((item) => sealedId(SECRET, id, item)));
      expect(text(sealed.spec)).not.toMatch(/correct_order|explanation/);
    }
  });

  it('never leaves the two columns of a match aligned, and says how many pairs there are', () => {
    for (const id of ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8']) {
      const sealed = sealActivity({ ...match, id }, SECRET);
      const spec = sealed.spec as { left: Array<{ id: string }>; right: Array<{ id: string }> };
      const aligned = spec.left.every((left, index) => spec.right[index].id === sealedId(SECRET, id, `r${index + 1}`) && left.id === sealedId(SECRET, id, `l${index + 1}`));
      expect(aligned).toBe(false);
      expect(sealed.pair_count).toBe(3);
      expect(text(sealed.spec)).not.toContain('pairs');
    }
  });

  it('gives a bank every chip and no blank its answer', () => {
    const spec = sealActivity(bank, SECRET).spec as { word_bank: string[]; blanks: Array<Record<string, unknown>> };
    expect([...spec.word_bank].sort()).toEqual(['h1', 'h7']);
    expect(spec.blanks).toEqual([{ id: 'a', kind: 'bank' }, { id: 'b', kind: 'bank' }]);
  });

  it('mixes the answer of a select among its options', () => {
    const spec = sealActivity(select, SECRET).spec as { blanks: Array<{ options: string[]; answer?: string; accept?: string[] }> };
    expect([...spec.blanks[0].options].sort()).toEqual(['div', 'p', 'span']);
    expect(spec.blanks[0].answer).toBeUndefined();
    expect(spec.blanks[0].accept).toBeUndefined();
  });

  it('keeps the name and the hint of a server check and drops how it is checked', () => {
    const spec = sealActivity(checks, SECRET).spec as { checks: unknown[] };
    expect(spec.checks).toEqual([{ id: 'one', label: 'One h2', hint: 'Use h2' }]);
  });

  it('leaves what the browser grades or nobody grades as authored', () => {
    expect(sealActivity(styled, SECRET)).toEqual({ spec: styled.spec, graded_by: 'browser', sealed: false });
    const concept = { id: 'c', kind: 'concept', spec: { instruction: { text: 'Read' } } };
    expect(sealActivity(concept, SECRET)).toEqual({ spec: concept.spec, graded_by: 'none', sealed: false });
  });
});

describe('unsealAnswer and answerKey', () => {
  const passes = (activity: { id: string; kind: string; spec: unknown }, answer: unknown) =>
    gradeSubmission(activity.kind, activity.spec, { answer: unsealAnswer(activity, answer, SECRET), response: null }, true, parseHtml).passed;

  it('grades the key of each choice kind, in sealed ids, as a pass', () => {
    expect(passes(single, { option_ids: [(answerKey(single, SECRET) as { correct_option_id: string }).correct_option_id] })).toBe(true);
    expect(passes(order, { order: (answerKey(order, SECRET) as { correct_order: string[] }).correct_order })).toBe(true);
    const pairs = (answerKey(match, SECRET) as { pairs: Array<{ left_id: string; right_id: string }> }).pairs;
    expect(passes(match, { pairs: pairs.map((pair) => [pair.left_id, pair.right_id]) })).toBe(true);
  });

  it('still grades an answer in authored ids, and refuses a wrong sealed one', () => {
    expect(passes(single, { option_ids: ['certo'] })).toBe(true);
    expect(passes(single, { option_ids: [sealedId(SECRET, 'act-1', 'p')] })).toBe(false);
  });

  it('has no key for a kind whose answer is typed', () => {
    expect(answerKey(bank, SECRET)).toBeNull();
    expect(answerKey(checks, SECRET)).toBeNull();
  });
});
