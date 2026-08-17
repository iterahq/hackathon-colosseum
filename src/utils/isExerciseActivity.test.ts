import { describe, it, expect, vi } from 'vitest';
import type { Activity } from '@/types/content';
import { isExerciseActivity } from './isExerciseActivity';

// BYOC resolves to `null` on a deploy without the itera-api, so without this the
// harness case would silently assert the fallback instead of the harness.
const api = vi.hoisted(() => ({ configured: true }));
vi.mock('@/api/iteraApi', () => ({ iteraApiConfigured: () => api.configured }));

function activity(over: Partial<Activity> = {}): Activity {
  return { id: 'a1', kind: 'concept', spec: {}, ...over } as Activity;
}

describe('isExerciseActivity', () => {
  it('answering kinds are exercises', () => {
    for (const kind of ['single_choice', 'multi_choice', 'match', 'order', 'quiz', 'code', 'chat_sandbox', 'terminal_sandbox'] as const) {
      expect(isExerciseActivity(activity({ kind }))).toBe(true);
    }
  });

  it('reading kinds are NOT exercises — they must not score in the podium', () => {
    for (const kind of ['concept', 'concept_reveal', 'diagram', 'video'] as const) {
      expect(isExerciseActivity(activity({ kind }))).toBe(false);
    }
  });

  it('a document is an exercise only when the learner has to write', () => {
    expect(isExerciseActivity(activity({ kind: 'document', spec: { body: 'só leitura' } }))).toBe(false);
    expect(isExerciseActivity(activity({ kind: 'document', spec: { prompt: 'Escreva…' } }))).toBe(true);
    expect(isExerciseActivity(activity({ kind: 'document', rubric: { mode: 'ai-judge' } }))).toBe(true);
    expect(isExerciseActivity(activity({ kind: 'document', rubric: { min_words: 25 } }))).toBe(true);
  });

  // O renderer usa `Boolean(spec.prompt)`: um prompt só de espaços AINDA abre a
  // textarea. Se o predicado aparasse, o aluno escreveria e não valeria ponto.
  it('a whitespace-only prompt counts, because the renderer still shows the textarea', () => {
    expect(isExerciseActivity(activity({ kind: 'document', spec: { prompt: '   ' } }))).toBe(true);
  });

  // Sem itera-api o renderer NÃO monta o juiz — cai na leitura. Se o predicado
  // dissesse "exercício", a atividade ficaria sem botão nenhum e sem saída.
  it('an ai-judge document without the itera-api is not an exercise', () => {
    api.configured = false;
    expect(isExerciseActivity(activity({ kind: 'document', rubric: { mode: 'ai-judge' } }))).toBe(false);
    api.configured = true;
  });

  it('a BYOC harness turns a reading kind into a graded round', () => {
    const byoc = {
      seed: { prompt: 'Conte um hobby seu.' },
      harness: { generation_prompt: 'Crie duas versões sobre {seed}.', interaction: 'pick_best' },
    };
    expect(isExerciseActivity(activity({ kind: 'concept', spec: { byoc } }))).toBe(true);
  });

  it('no activity is not an exercise', () => {
    expect(isExerciseActivity(null)).toBe(false);
    expect(isExerciseActivity(undefined)).toBe(false);
  });
});
