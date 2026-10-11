import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { canonicalJson, gradeSubmission, gradingMode, matchesBlank, resolveSpec, sourceCloses, sourceHas, type HtmlParser } from './grading.ts';
import { combineProofs, lessonProof, verifiedShare, type PassingAttempt } from './proof.ts';
import { sha256Hex } from './sha256.ts';

const parseHtml: HtmlParser = (source) => {
  const { document } = new JSDOM(source).window;
  return {
    count: (selector) => document.querySelectorAll(selector).length,
    text: (selector) => document.querySelector(selector)?.textContent ?? null,
    attr: (selector, name) => document.querySelector(selector)?.getAttribute(name) ?? null,
  };
};

const grade = (kind: string, spec: unknown, answer: unknown, response: string | null = null, claimed = true) =>
  gradeSubmission(kind, spec, { answer, response }, claimed, parseHtml);

const single = { options: [{ id: 'a' }, { id: 'b' }], correct_option_id: 'b' };
const multi = { options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], correct_option_ids: ['a', 'c'] };
const order = { items: [{ id: 'x' }, { id: 'y' }, { id: 'z' }], correct_order: ['x', 'y', 'z'] };
const match = { pairs: [{ left_id: 'l1', right_id: 'r1' }, { left_id: 'l2', right_id: 'r2' }] };
const fill = {
  language: 'html',
  starter: '<{{blank:a}}>Oi</{{blank:a2}}>\n<p class="{{blank:b}}">{{blank:c}}</p>',
  blanks: [
    { id: 'a', kind: 'bank', answer: 'h1' },
    { id: 'a2', kind: 'bank', answer: 'h1' },
    { id: 'b', kind: 'text', answer: 'card', accept: ['cartao'] },
    { id: 'c', kind: 'text', answer: { pt: 'José', en: 'Joseph' }, match: 'loose' },
  ],
};
const checks = {
  language: 'html',
  starter: '<h1></h1>',
  checks: [
    { id: 'title', selector: 'head > title:not(:empty)', assert: { type: 'count', equals: 1 } },
    { id: 'h2', selector: 'body > h1 + h2', assert: { type: 'text', contains: 'Sobre mim' } },
    { id: 'p', selector: 'body > h2 + p', assert: { type: 'exists' } },
    { id: 'closes', selector: 'title, h1, h2, p', assert: { type: 'closes' } },
    { id: 'doctype', selector: 'html', assert: { type: 'source_has', tag: 'doctype' } },
    { id: 'lang', selector: 'html', assert: { type: 'attr', name: 'lang', equals: 'pt-BR' } },
    { id: 'class', selector: 'p', assert: { type: 'class', equals: 'intro big' } },
  ],
};
const solved = '<!DOCTYPE html>\n<html lang="pt-BR"><head><title>Ana</title></head><body><h1>Ana</h1><h2>sobre  mím</h2><p class="big intro">Oi</p></body></html>';

describe('gradingMode', () => {
  it('depends on the activity, never on the submission', () => {
    expect(gradingMode('single_choice', single)).toBe('server');
    expect(gradingMode('code_fill_type', fill)).toBe('server');
    expect(gradingMode('code_editor_checks', checks)).toBe('server');
    expect(gradingMode('concept', {})).toBe('participation');
    expect(gradingMode('code_editor_ungraded', {})).toBe('participation');
    expect(gradingMode('spot', {})).toBe('self_reported');
    expect(gradingMode('some_future_kind', {})).toBe('self_reported');
  });

  it('checks that need a browser are self-reported', () => {
    const style = { ...checks, checks: [...checks.checks, { id: 's', selector: 'h1', assert: { type: 'style', property: 'color', equals: 'red' } }] };
    const steps = { ...checks, checks: [{ ...checks.checks[0], steps: [{ do: 'click', selector: '#go' }] }] };
    const script = { ...checks, starter: '<SCRIPT>go()</script>' };
    expect(gradingMode('code_editor_checks', style)).toBe('self_reported');
    expect(gradingMode('code_editor_checks', steps)).toBe('self_reported');
    expect(gradingMode('code_editor_checks', script)).toBe('self_reported');
    expect(gradingMode('code_editor_checks', { ...checks, checks: [] })).toBe('self_reported');
    expect(gradingMode('code_editor_checks', { ...checks, language: 'tsx' })).toBe('self_reported');
  });
});

describe('gradeSubmission: choice kinds', () => {
  it('single choice', () => {
    expect(grade('single_choice', single, { option_ids: ['b'] })).toEqual({ mode: 'server', passed: true });
    expect(grade('single_choice', single, { option_ids: ['a'] })).toEqual({ mode: 'server', passed: false, reason: 'answer_rejected' });
    expect(grade('single_choice', single, { option_ids: ['a', 'b'] }).passed).toBe(false);
  });

  it('a claimed pass without the answer is refused', () => {
    expect(grade('single_choice', single, null)).toEqual({ mode: 'server', passed: false, reason: 'answer_required' });
    expect(grade('single_choice', single, { option_ids: 'b' }).reason).toBe('answer_required');
    expect(grade('order', order, {}).reason).toBe('answer_required');
    expect(grade('match', match, { pairs: [['l1']] }).reason).toBe('answer_required');
  });

  it('multi choice is set equality', () => {
    expect(grade('multi_choice', multi, { option_ids: ['c', 'a'] }).passed).toBe(true);
    expect(grade('multi_choice', multi, { option_ids: ['a'] }).passed).toBe(false);
    expect(grade('multi_choice', multi, { option_ids: ['a', 'a'] }).passed).toBe(false);
    expect(grade('multi_choice', multi, { option_ids: ['a', 'b', 'c'] }).passed).toBe(false);
  });

  it('order and match', () => {
    expect(grade('order', order, { order: ['x', 'y', 'z'] }).passed).toBe(true);
    expect(grade('order', order, { order: ['y', 'x', 'z'] }).passed).toBe(false);
    expect(grade('order', order, { order: ['x', 'y'] }).passed).toBe(false);
    expect(grade('match', match, { pairs: [['l2', 'r2'], ['l1', 'r1']] }).passed).toBe(true);
    expect(grade('match', match, { pairs: [['l1', 'r2'], ['l2', 'r1']] }).passed).toBe(false);
    expect(grade('match', match, { pairs: [['l1', 'r1'], ['l1', 'r1']] }).passed).toBe(false);
  });

  it('a spec without a key passes nothing', () => {
    expect(grade('single_choice', { options: [] }, { option_ids: ['a'] }).passed).toBe(false);
    expect(grade('multi_choice', { correct_option_ids: [] }, { option_ids: [] }).passed).toBe(false);
    expect(grade('order', { correct_order: [] }, { order: [] }).passed).toBe(false);
    expect(grade('match', { pairs: [] }, { pairs: [] }).passed).toBe(false);
  });
});

describe('gradeSubmission: filled templates', () => {
  it('accepts the template filled with the answers, in either language', () => {
    expect(grade('code_fill_type', fill, null, '<h1>Oi</h1>\n<p class="card">José</p>').passed).toBe(true);
    expect(grade('code_fill_type', fill, null, '<h1>Oi</h1>\n<p class="cartao">Joseph</p>').passed).toBe(true);
  });

  it('a loose blank forgives case and accents, an exact one does not', () => {
    expect(grade('code_fill_type', fill, null, '<h1>Oi</h1>\n<p class="card">jose</p>').passed).toBe(true);
    expect(grade('code_fill_type', fill, null, '<h1>Oi</h1>\n<p class="Card">José</p>').passed).toBe(false);
  });

  it('refuses a wrong blank, text outside the holes and a missing source', () => {
    expect(grade('code_fill_type', fill, null, '<h2>Oi</h1>\n<p class="card">José</p>')).toEqual({ mode: 'server', passed: false, reason: 'answer_rejected' });
    expect(grade('code_fill_type', fill, null, '<h1>Tchau</h1>\n<p class="card">José</p>').passed).toBe(false);
    expect(grade('code_fill_type', fill, null, null).reason).toBe('answer_required');
    expect(grade('code_fill_type', { ...fill, blanks: [] }, null, 'x').reason).toBe('invalid_spec');
  });

  it('matchesBlank follows the player rule', () => {
    expect(matchesBlank({ loose: false, accepted: ['useState'] }, ' useState ')).toBe(true);
    expect(matchesBlank({ loose: false, accepted: ['useState'] }, 'usestate')).toBe(false);
    expect(matchesBlank({ loose: true, accepted: ['José'] }, '...')).toBe(false);
  });
});

describe('gradeSubmission: html checks', () => {
  it('passes a source that satisfies every check and fails the template', () => {
    expect(grade('code_editor_checks', checks, null, solved)).toEqual({ mode: 'server', passed: true });
    expect(grade('code_editor_checks', checks, null, '<h1></h1>')).toEqual({ mode: 'server', passed: false, reason: 'answer_rejected' });
  });

  it('one failing check fails the answer', () => {
    expect(grade('code_editor_checks', checks, null, solved.replace('<!DOCTYPE html>', '')).passed).toBe(false);
    expect(grade('code_editor_checks', checks, null, solved.replace('</h2>', '</h3>')).passed).toBe(false);
    expect(grade('code_editor_checks', checks, null, solved.replace('big intro', 'big intro extra')).passed).toBe(false);
    expect(grade('code_editor_checks', checks, null, solved.replace(' lang="pt-BR"', '')).passed).toBe(false);
  });

  it('an invalid selector fails the check instead of throwing', () => {
    const broken = { ...checks, checks: [{ id: 'x', selector: 'p >', assert: { type: 'exists' } }] };
    expect(grade('code_editor_checks', broken, null, solved).passed).toBe(false);
  });

  it('source asserts read the text as written', () => {
    expect(sourceCloses('<h2>a</h3>', 'h2, h3')).toBe(false);
    expect(sourceCloses('<p>a<br>b</p><!-- <p> -->', '*')).toBe(true);
    expect(sourceHas('<!-- <body> --><div>', 'body')).toBe(false);
    expect(sourceHas('<!doctype HTML><BODY>', 'body')).toBe(true);
  });
});

describe('gradeSubmission: claims', () => {
  it('a learner who says they missed is recorded as a miss', () => {
    expect(grade('single_choice', single, { option_ids: ['b'] }, null, false)).toEqual({ mode: 'server', passed: false });
  });

  it('kinds the server cannot grade record the claim under their own mode', () => {
    expect(grade('spot', {}, null)).toEqual({ mode: 'self_reported', passed: true });
    expect(grade('concept', {}, null)).toEqual({ mode: 'participation', passed: true });
    expect(grade('spot', {}, null, null, false)).toEqual({ mode: 'self_reported', passed: false });
  });
});

describe('hashing', () => {
  it('sha256Hex agrees with the platform', () => {
    for (const text of ['', 'abc', 'ação é ✓', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'y'.repeat(1000)]) {
      expect(sha256Hex(text)).toBe(createHash('sha256').update(text).digest('hex'));
    }
  });

  it('canonicalJson ignores key order', () => {
    expect(canonicalJson({ b: [1, { d: 1, c: 2 }], a: null })).toBe(canonicalJson({ a: null, b: [1, { c: 2, d: 1 }] }));
    expect(canonicalJson(undefined)).toBe('null');
  });

  it('resolveSpec collapses language bags with pt as fallback', () => {
    expect(resolveSpec({ a: { pt: 'sim', en: 'yes' }, b: [{ pt: 'só' }], c: { x: 1 } }, 'en')).toEqual({ a: 'yes', b: ['só'], c: { x: 1 } });
  });
});

describe('lessonProof', () => {
  const attempt = (activity_id: string, mode: PassingAttempt['mode']): PassingAttempt => ({ activity_id, mode, answer_hash: 'a'.repeat(64), spec_hash: 'b'.repeat(64), created_at: '2026-10-11T12:00:00Z' });
  const attempts = new Map([attempt('1', 'server'), attempt('2', 'server'), attempt('3', 'self_reported'), attempt('4', 'participation')].map((row) => [row.activity_id, row]));

  it('counts what stands behind a lesson and commits to the attempts', () => {
    const proof = lessonProof(['4', '3', '2', '1', '5'], attempts);
    expect(proof).toMatchObject({ verified: 2, self_reported: 1, participation: 1, legacy: 1 });
    expect(proof?.evidence).toMatch(/^[0-9a-f]{64}$/);
    expect(lessonProof(['1', '2', '3', '4', '5'], attempts)).toEqual(proof);
    expect(verifiedShare(proof!)).toBe('2/3 +1 legacy');
    expect(verifiedShare({ ...proof!, legacy: 0 })).toBe('2/3');
  });

  it('a lesson without attempts states nothing', () => {
    expect(lessonProof(['8', '9'], attempts)).toBeNull();
    expect(combineProofs([])).toBeNull();
  });

  it('a trail adds its days', () => {
    const day = lessonProof(['1', '3'], attempts)!;
    expect(combineProofs([day, day])).toMatchObject({ verified: 2, self_reported: 2, participation: 0, legacy: 0 });
  });
});
