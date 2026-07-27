import { describe, it, expect } from 'vitest';
import type { GeneratedChoiceTree } from '@iterahq/activity-spec';
import {
  emptyAnswer,
  gradeByoc,
  isAnswerComplete,
  toneFor,
  withVerdict,
} from '@/utils/byocAnswer';

/**
 * BYOC correction is a pure lookup against the gabarito the generation embedded
 * (ADR-13) — no model call in the answer path. These pin that lookup, since a
 * wrong grade here silently mis-scores a learner with no judge to catch it.
 */

const pickBest: GeneratedChoiceTree = {
  interaction: 'pick_best',
  options: [
    { id: 'a', content: 'Pedido vago', ai_response: 'Resposta genérica' },
    { id: 'b', content: 'Pedido com contexto', ai_response: 'Resposta sob medida' },
  ],
  correct_option_id: 'b',
};

const judgeEach: GeneratedChoiceTree = {
  interaction: 'judge_each',
  options: [
    { id: 'a', content: 'Sem contexto', ai_response: 'Genérica', expected_verdict: 'bad' },
    { id: 'b', content: 'Com contexto', ai_response: 'Sob medida', expected_verdict: 'good' },
  ],
};

describe('pick_best', () => {
  it('grades only the authored correct option as right', () => {
    expect(gradeByoc(pickBest, { interaction: 'pick_best', selected: 'b' })).toBe(true);
    expect(gradeByoc(pickBest, { interaction: 'pick_best', selected: 'a' })).toBe(false);
  });

  it('is incomplete until something is selected', () => {
    expect(isAnswerComplete(pickBest, emptyAnswer(pickBest))).toBe(false);
    expect(isAnswerComplete(pickBest, { interaction: 'pick_best', selected: 'a' })).toBe(true);
  });

  it('reveals the correct option even when the learner picked another', () => {
    const answer = { interaction: 'pick_best', selected: 'a' } as const;
    expect(toneFor(pickBest, answer, 'a', true)).toBe('wrong');
    expect(toneFor(pickBest, answer, 'b', true)).toBe('correct');
    expect(toneFor(pickBest, answer, 'a', false)).toBe('chosen');
    expect(toneFor(pickBest, answer, 'b', false)).toBe('neutral');
  });
});

describe('judge_each', () => {
  it('requires EVERY option classified right', () => {
    const all = { interaction: 'judge_each', verdicts: { a: 'bad', b: 'good' } } as const;
    const one = { interaction: 'judge_each', verdicts: { a: 'bad', b: 'bad' } } as const;
    expect(gradeByoc(judgeEach, all)).toBe(true);
    expect(gradeByoc(judgeEach, one)).toBe(false);
  });

  it('is incomplete while any option is unlabelled', () => {
    const partial = withVerdict(emptyAnswer(judgeEach), 'a', 'bad');
    expect(isAnswerComplete(judgeEach, partial)).toBe(false);
    expect(isAnswerComplete(judgeEach, withVerdict(partial, 'b', 'good'))).toBe(true);
  });

  it('never marks an option the learner never classified as wrong', () => {
    const partial = withVerdict(emptyAnswer(judgeEach), 'a', 'bad');
    expect(toneFor(judgeEach, partial, 'a', true)).toBe('correct');
    expect(toneFor(judgeEach, partial, 'b', true)).toBe('neutral');
    expect(toneFor(judgeEach, emptyAnswer(judgeEach), 'a', true)).toBe('neutral');
  });
});

describe('answer shape', () => {
  it('withVerdict leaves a pick_best answer untouched', () => {
    const answer = emptyAnswer(pickBest);
    expect(withVerdict(answer, 'a', 'good')).toBe(answer);
  });
});
