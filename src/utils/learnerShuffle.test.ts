/**
 * The two properties `learnerShuffle` has to hold AT THE SAME TIME, and which
 * are easy to break in opposite directions:
 *
 *   1. DETERMINISTIC — the same learner on the same activity always sees the
 *      same order (the bug: `Math.random()` per mount);
 *   2. still SHUFFLED — different learners do NOT see the same order (the bug a
 *      careless fix introduces: seeding on the activity alone, which makes the
 *      shuffle a constant and defeats its pedagogical reason for existing).
 *
 * Plus the `order`-specific guarantee: the learner is never handed the solution.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { rememberStorageScope, clearIteraStorage } from './storageScope';
import {
  learnerScope,
  learnerShuffle,
  learnerShuffleAvoidingSolution,
} from './learnerShuffle';

const OPTIONS = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id }));
const ACTIVITY = 'activity-1';
const ids = (list: { id: string }[]) => list.map((o) => o.id);

/** Become a given learner in this browser (what `getIteraUserId` does for real). */
function asLearner(userId: string) {
  clearIteraStorage();
  rememberStorageScope(userId);
}

describe('learnerShuffle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('é estável para o MESMO aluno na MESMA activity', () => {
    asLearner('aluno-a');
    const first = ids(learnerShuffle(OPTIONS, ACTIVITY));
    for (let i = 0; i < 5; i += 1) {
      expect(ids(learnerShuffle(OPTIONS, ACTIVITY))).toEqual(first);
    }
  });

  it('alunos DIFERENTES veem ordens diferentes (o embaralhamento não virou constante)', () => {
    // 12 learners over 6 options (720 permutations): a correct implementation
    // gives ~12 distinct arrangements; a seed that ignored the learner would
    // give exactly 1. The bar below is deliberately far from both, so this
    // cannot go green on a degenerate implementation and cannot flake either —
    // the values are fixed, there is no randomness in this test.
    const arrangements = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      asLearner(`aluno-${i}`);
      arrangements.add(ids(learnerShuffle(OPTIONS, ACTIVITY)).join(','));
    }
    expect(arrangements.size).toBeGreaterThan(6);
  });

  it('o MESMO aluno vê ordens diferentes em activities diferentes', () => {
    asLearner('aluno-a');
    const arrangements = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      arrangements.add(ids(learnerShuffle(OPTIONS, `activity-${i}`)).join(','));
    }
    expect(arrangements.size).toBeGreaterThan(6);
  });

  it('o `salt` separa coleções independentes da MESMA activity (colunas do match)', () => {
    asLearner('aluno-a');
    const left = ids(learnerShuffle(OPTIONS, ACTIVITY, 'left'));
    const right = ids(learnerShuffle(OPTIONS, ACTIVITY, 'right'));
    expect(left).not.toEqual(right);
  });

  it('preserva o conjunto: embaralha, não perde nem inventa opção', () => {
    asLearner('aluno-a');
    expect([...ids(learnerShuffle(OPTIONS, ACTIVITY))].sort()).toEqual(ids(OPTIONS));
  });

  it('troca de aluno na mesma máquina troca a ordem (lab compartilhado)', () => {
    asLearner('aluno-a');
    const a = ids(learnerShuffle(OPTIONS, ACTIVITY));
    asLearner('aluno-b');
    expect(ids(learnerShuffle(OPTIONS, ACTIVITY))).not.toEqual(a);
  });

  it('sem identidade resolvida ainda é estável dentro do mesmo browser', () => {
    // No `rememberStorageScope` — the anon fallback path.
    const first = ids(learnerShuffle(OPTIONS, ACTIVITY));
    expect(ids(learnerShuffle(OPTIONS, ACTIVITY))).toEqual(first);
    expect(learnerScope()).toBeTruthy();
  });
});

describe('learnerShuffleAvoidingSolution', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('NUNCA entrega a solução pronta, para nenhum aluno nem activity', () => {
    const solution = ['i1', 'i2', 'i3'];
    for (let learner = 0; learner < 40; learner += 1) {
      asLearner(`aluno-${learner}`);
      for (let a = 0; a < 10; a += 1) {
        const start = learnerShuffleAvoidingSolution(solution, `activity-${a}`, solution);
        expect(start).not.toEqual(solution);
        expect([...start].sort()).toEqual([...solution].sort());
      }
    }
  });

  it('é estável para o mesmo aluno + activity', () => {
    asLearner('aluno-a');
    const solution = ['i1', 'i2', 'i3', 'i4'];
    const first = learnerShuffleAvoidingSolution(solution, ACTIVITY, solution);
    expect(learnerShuffleAvoidingSolution(solution, ACTIVITY, solution)).toEqual(first);
  });

  it('listas de 0 ou 1 item passam intactas (não existe outra permutação)', () => {
    asLearner('aluno-a');
    expect(learnerShuffleAvoidingSolution([], ACTIVITY, [])).toEqual([]);
    expect(learnerShuffleAvoidingSolution(['só'], ACTIVITY, ['só'])).toEqual(['só']);
  });
});
