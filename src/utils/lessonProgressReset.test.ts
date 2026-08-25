import { describe, it, expect } from 'vitest';
import type { ProgressStatus } from '@/services/progress.service';
import { activitiesToReopen, REOPENED_PROGRESS_STATUS } from './lessonProgressReset';

describe('activitiesToReopen', () => {
  it('reabre a atividade concluída — o buraco que o corte em localStorage não alcançava', () => {
    const statuses: Record<string, ProgressStatus> = { concept: 'completed', video: 'completed' };
    expect(activitiesToReopen(['concept', 'video'], statuses)).toEqual(['concept', 'video']);
  });

  it('não toca no que não estava concluído', () => {
    const statuses: Record<string, ProgressStatus> = {
      a1: 'completed',
      a2: 'in_progress',
      a3: 'not_started',
    };
    expect(activitiesToReopen(['a1', 'a2', 'a3'], statuses)).toEqual(['a1']);
  });

  it('atividade que o aluno nunca abriu não vira linha', () => {
    expect(activitiesToReopen(['a1', 'a2'], { a1: 'completed' })).toEqual(['a1']);
  });

  it('preserva a ordem da lição', () => {
    const statuses: Record<string, ProgressStatus> = {
      a1: 'completed',
      a2: 'in_progress',
      a3: 'completed',
    };
    expect(activitiesToReopen(['a3', 'a2', 'a1'], statuses)).toEqual(['a3', 'a1']);
  });

  it('id repetido entra uma vez só', () => {
    expect(activitiesToReopen(['a1', 'a1'], { a1: 'completed' })).toEqual(['a1']);
  });

  it('lição vazia e progresso vazio não produzem escrita', () => {
    expect(activitiesToReopen([], { a1: 'completed' })).toEqual([]);
    expect(activitiesToReopen(['a1'], {})).toEqual([]);
  });

  it('id vazio é descartado — ele viraria um `.in()` que casa com nada', () => {
    expect(activitiesToReopen(['', 'a1'], { '': 'completed', a1: 'completed' })).toEqual(['a1']);
  });

  it('reabre no enum de itera.progress_status, nunca no vocabulário da UI', () => {
    expect(REOPENED_PROGRESS_STATUS).toBe('in_progress');
    expect(['not_started', 'in_progress', 'completed']).toContain(REOPENED_PROGRESS_STATUS);
  });
});
