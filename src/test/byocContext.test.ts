import { describe, it, expect } from 'vitest';
import { assembleContext, allRoundsPicked, pickedOption } from '@/utils/byocContext';

/**
 * The assembled prompt IS the reward of `build_context` — it is what the learner
 * takes away, so its shape is a contract and not a formatting detail.
 */

const rounds = [
  {
    id: 'r1',
    question: 'Quem pede?',
    options: [
      { id: 'a', content: 'Sou zagueiro.', ai_response: 'Zagueiro, então...' },
      { id: 'b', content: 'Sou goleiro.', ai_response: 'Goleiro, então...' },
    ],
  },
  {
    id: 'r2',
    question: 'O que quer?',
    options: [
      { id: 'a', content: 'Quero 3 exercícios.', ai_response: '1) ... 2) ... 3) ...' },
      { id: 'b', content: 'Quero entender o erro.', ai_response: 'O erro comum é...' },
    ],
  },
];

describe('pickedOption', () => {
  it('is undefined until the round is answered', () => {
    expect(pickedOption(rounds[0], {})).toBeUndefined();
    expect(pickedOption(rounds[0], { r1: 'b' })?.content).toBe('Sou goleiro.');
  });
});

describe('allRoundsPicked', () => {
  it('needs every round, not just the last one visited', () => {
    expect(allRoundsPicked(rounds, { r1: 'a' })).toBe(false);
    expect(allRoundsPicked(rounds, { r1: 'a', r2: 'b' })).toBe(true);
  });
});

describe('assembleContext', () => {
  it('opens with the learner text and follows the round order', () => {
    expect(assembleContext('jogo futebol', rounds, { r1: 'a', r2: 'a' }, 'pt')).toBe(
      'jogo futebol\nSou zagueiro.\nQuero 3 exercícios.'
    );
  });

  it('skips a round nobody answered instead of leaving a blank line', () => {
    expect(assembleContext('jogo futebol', rounds, { r2: 'b' }, 'pt')).toBe(
      'jogo futebol\nQuero entender o erro.'
    );
  });

  it('drops the seed line when the learner wrote nothing', () => {
    expect(assembleContext('   ', rounds, { r1: 'b' }, 'pt')).toBe('Sou goleiro.');
  });
});
