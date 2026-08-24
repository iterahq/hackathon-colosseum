import { describe, it, expect } from 'vitest';
import type { Activity } from '@/types/content';
import {
  isAnswerableLiveKind,
  hasRevealableAnswer,
  canReopenSubmission,
  isGuidedCodeActivity,
  activityHasRevealableAnswer,
} from './isAnswerableLiveKind';

function activity(kind: string, spec: unknown): Activity {
  return {
    id: 'a',
    lessonId: 'l',
    ordinal: 0,
    kind: kind as Activity['kind'],
    spec: spec as Activity['spec'],
    rubric: null,
  };
}

const GUIDED_CODE = activity('code', {
  prompt: 'p',
  starter: 'const [n, setN] = {{blank:hook}}(0);',
  blanks: [{ id: 'hook', kind: 'bank', answer: 'useState' }],
});
const OPEN_CODE = activity('code', {
  prompt: 'p',
  starter: 'const a = 1;',
  checks: [{ id: 'c', description: 'roda', assert: 'true' }],
});

const ANSWERABLE = [
  'single_choice',
  'multi_choice',
  'match',
  'order',
  'quiz',
  'code',
  'chat_sandbox',
  'terminal_sandbox',
];
const CONTENT = ['concept', 'video', 'document', 'diagram'];

describe('isAnswerableLiveKind', () => {
  it.each(ANSWERABLE)('true for answerable kind %s', (kind) => {
    expect(isAnswerableLiveKind(kind)).toBe(true);
  });

  it.each(CONTENT)('false for content kind %s', (kind) => {
    expect(isAnswerableLiveKind(kind)).toBe(false);
  });

  it('false for empty / null / unknown', () => {
    expect(isAnswerableLiveKind('')).toBe(false);
    expect(isAnswerableLiveKind(null)).toBe(false);
    expect(isAnswerableLiveKind(undefined)).toBe(false);
    expect(isAnswerableLiveKind('mystery')).toBe(false);
  });
});

describe('hasRevealableAnswer', () => {
  it.each([
    'single_choice',
    'multi_choice',
    'match',
    'order',
    'quiz',
    'chat_sandbox',
    'terminal_sandbox',
    'concept_reveal',
  ])('true for %s — these kinds have an answer we can put on screen', (kind) => {
    expect(hasRevealableAnswer(kind)).toBe(true);
  });

  it('false for code — the spec carries no solution, so there is nothing to reveal', () => {
    expect(hasRevealableAnswer('code')).toBe(false);
  });

  it.each(CONTENT)('false for content kind %s', (kind) => {
    expect(hasRevealableAnswer(kind)).toBe(false);
  });

  it('false for empty / null / unknown', () => {
    expect(hasRevealableAnswer('')).toBe(false);
    expect(hasRevealableAnswer(null)).toBe(false);
    expect(hasRevealableAnswer(undefined)).toBe(false);
    expect(hasRevealableAnswer('mystery')).toBe(false);
  });
});

describe('canReopenSubmission', () => {
  it('true for code — the verdict says WHICH check failed, never the solution', () => {
    expect(canReopenSubmission('code')).toBe(true);
  });

  it.each(['single_choice', 'multi_choice', 'match', 'order', 'quiz'])(
    'false for %s — the feedback already showed the right option, so a retry is a free point',
    (kind) => {
      expect(canReopenSubmission(kind)).toBe(false);
    }
  );

  it.each(['chat_sandbox', 'terminal_sandbox'])(
    'false for %s — it already owns its own critique→retry loop',
    (kind) => {
      expect(isAnswerableLiveKind(kind)).toBe(true);
      expect(canReopenSubmission(kind)).toBe(false);
    }
  );

  it.each(CONTENT)('false for content kind %s', (kind) => {
    expect(canReopenSubmission(kind)).toBe(false);
  });

  it('false for empty / null / unknown', () => {
    expect(canReopenSubmission('')).toBe(false);
    expect(canReopenSubmission(null)).toBe(false);
    expect(canReopenSubmission(undefined)).toBe(false);
    expect(canReopenSubmission('mystery')).toBe(false);
  });

  it('is the INVERSE of hasRevealableAnswer over the answerable kinds', () => {
    // Not a coincidence and not derivable-by-luck: the membership rule is "did the
    // feedback hand over the answer?". If a kind ever satisfies both, one of the
    // two sets is wrong.
    expect(ANSWERABLE.some((k) => hasRevealableAnswer(k) && canReopenSubmission(k))).toBe(false);
  });
});

describe('isGuidedCodeActivity', () => {
  it('true only when the row carries authored holes', () => {
    expect(isGuidedCodeActivity(GUIDED_CODE)).toBe(true);
    expect(isGuidedCodeActivity(OPEN_CODE)).toBe(false);
  });

  it('false for a `blanks` that is empty, absent or not an array', () => {
    expect(isGuidedCodeActivity(activity('code', { starter: 's', blanks: [] }))).toBe(false);
    expect(isGuidedCodeActivity(activity('code', { starter: 's' }))).toBe(false);
    expect(isGuidedCodeActivity(activity('code', { starter: 's', blanks: 'useState' }))).toBe(false);
  });

  it('false for a non-object spec, and for null / undefined', () => {
    expect(isGuidedCodeActivity(activity('code', null))).toBe(false);
    expect(isGuidedCodeActivity(activity('code', []))).toBe(false);
    expect(isGuidedCodeActivity(null)).toBe(false);
    expect(isGuidedCodeActivity(undefined)).toBe(false);
  });

  it('never claims another kind, even one whose spec happens to have `blanks`', () => {
    expect(isGuidedCodeActivity(activity('quiz', { blanks: [{ id: 'x' }] }))).toBe(false);
  });
});

describe('activityHasRevealableAnswer', () => {
  it('reveals guided code — `blanks[].answer` IS the gabarito the author wrote', () => {
    expect(activityHasRevealableAnswer(GUIDED_CODE)).toBe(true);
  });

  it('does NOT reveal the open editor — `checks` is not a solution', () => {
    // A regressão que este teste tranca: um botão de revelar no editor aberto
    // para o cronômetro e não mostra nada, que é a armadilha original.
    expect(activityHasRevealableAnswer(OPEN_CODE)).toBe(false);
  });

  it('keeps agreeing with the kind-level predicate everywhere else', () => {
    for (const kind of ANSWERABLE.concat(CONTENT, ['concept_reveal'])) {
      if (kind === 'code') continue;
      expect(activityHasRevealableAnswer(activity(kind, {}))).toBe(hasRevealableAnswer(kind));
    }
  });

  it('false for null / undefined', () => {
    expect(activityHasRevealableAnswer(null)).toBe(false);
    expect(activityHasRevealableAnswer(undefined)).toBe(false);
  });

  it('leaves the KIND-level answer for code untouched', () => {
    // `hasRevealableAnswer('code')` continua falso de propósito: a pergunta não
    // tem resposta no nível do kind, e quem chamar assim tem que ser corrigido.
    expect(hasRevealableAnswer('code')).toBe(false);
  });
});

describe('the two predicates answer DIFFERENT questions', () => {
  it('code diverges one way: timed, but the kind alone has nothing to reveal', () => {
    expect(isAnswerableLiveKind('code')).toBe(true);
    expect(hasRevealableAnswer('code')).toBe(false);
  });

  it('concept_reveal diverges the OTHER way: nothing to answer, but an answer to show', () => {
    expect(isAnswerableLiveKind('concept_reveal')).toBe(false);
    expect(hasRevealableAnswer('concept_reveal')).toBe(true);
  });

  it('neither predicate can be derived from the other', () => {
    const kinds = ANSWERABLE.concat(CONTENT, ['concept_reveal', 'mystery']);
    expect(kinds.some((k) => isAnswerableLiveKind(k) && !hasRevealableAnswer(k))).toBe(true);
    expect(kinds.some((k) => hasRevealableAnswer(k) && !isAnswerableLiveKind(k))).toBe(true);
  });
});
