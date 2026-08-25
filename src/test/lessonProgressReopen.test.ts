import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * O reset da aula ao vivo alcançando `itera.progress`.
 *
 * O corte por instante (`liveLessonReset`) resolve `class_answers` e o
 * localStorage. Os kinds que só se "marca como concluído" — `concept`,
 * `concept_reveal`, `diagram`, `video`, `document` de leitura — não passam por
 * nenhum dos dois: o concluído deles é uma linha em `itera.progress`. Depois de
 * uma aula real o Samuel reportou exatamente isso: *"Questoes de marcar
 * concluido não estão disponiveis para resetar"*.
 *
 * O que este teste tranca, e por quê:
 *
 *  1. A escrita é um UPDATE escopado no próprio aluno. RLS só tem
 *     `progress_rw_self` para escrita — o professor tem SELECT e nada mais —
 *     então esta é a única forma que o reset tem de alcançar a tabela.
 *  2. Ela rebaixa para `in_progress` e limpa `completed_at`. Não apaga a linha:
 *     o aluno passou pela atividade, e dizer que não passou é falso e
 *     irrecuperável.
 *  3. Ela toca SÓ o que estava `completed`. Escrever nas outras criaria linha
 *     para atividade que a turma nem chegou a abrir.
 *  4. Ela não escreve `activity_results` nem `activity_traces` nem XP. A
 *     tentativa antiga aconteceu, e o relatório pós-aula do professor a lê.
 */

type Row = Record<string, unknown>;

const updates: Array<{ table: string; payload: Row; eq: Row; in: { col: string; ids: string[] } }> =
  [];
const touched: string[] = [];

let progressRows: Array<{ activity_id: string; status: string }> = [];
let selectError: { message: string } | null = null;
let updateError: { message: string } | null = null;

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    from: (table: string) => {
      touched.push(table);
      return {
        select: () => {
          const filters: Row = {};
          const chain = {
            eq: (col: string, val: unknown) => {
              filters[col] = val;
              return chain;
            },
            in: () => Promise.resolve({ data: selectError ? null : progressRows, error: selectError }),
          };
          return chain;
        },
        update: (payload: Row) => {
          const eq: Row = {};
          const chain = {
            eq: (col: string, val: unknown) => {
              eq[col] = val;
              return chain;
            },
            in: (col: string, ids: string[]) => {
              updates.push({ table, payload, eq, in: { col, ids } });
              return Promise.resolve({ error: updateError });
            },
          };
          return chain;
        },
        insert: () => Promise.resolve({ error: null }),
        upsert: () => Promise.resolve({ error: null }),
      };
    },
  }),
}));
vi.mock('@/services/iteraUser', () => ({
  getIteraUserId: vi.fn().mockResolvedValue('itera-user-1'),
}));
vi.mock('@/services/gamification.service', () => ({
  awardActivityXp: vi.fn().mockResolvedValue(undefined),
}));

import { reopenLessonProgress } from '@/services/progress.service';

const LESSON = ['concept-1', 'quiz-1', 'video-1'];

beforeEach(() => {
  updates.length = 0;
  touched.length = 0;
  progressRows = [];
  selectError = null;
  updateError = null;
});

describe('reopenLessonProgress', () => {
  it('rebaixa a atividade de "marcar como concluído" que ficava presa no banco', async () => {
    progressRows = [
      { activity_id: 'concept-1', status: 'completed' },
      { activity_id: 'video-1', status: 'completed' },
    ];

    await expect(reopenLessonProgress(LESSON)).resolves.toEqual(['concept-1', 'video-1']);

    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe('progress');
    expect(updates[0].payload).toEqual({ status: 'in_progress', completed_at: null });
    expect(updates[0].in.ids).toEqual(['concept-1', 'video-1']);
  });

  it('escopa a escrita no próprio aluno — é o que a RLS `progress_rw_self` exige', async () => {
    progressRows = [{ activity_id: 'concept-1', status: 'completed' }];
    await reopenLessonProgress(LESSON);
    expect(updates[0].eq).toEqual({ user_id: 'itera-user-1' });
    expect(updates[0].in.col).toBe('activity_id');
  });

  it('não escreve nada quando nada estava concluído', async () => {
    progressRows = [{ activity_id: 'quiz-1', status: 'in_progress' }];
    await expect(reopenLessonProgress(LESSON)).resolves.toEqual([]);
    expect(updates).toHaveLength(0);
  });

  it('lição sem atividades não vira round-trip', async () => {
    await expect(reopenLessonProgress([])).resolves.toEqual([]);
    expect(touched).toHaveLength(0);
  });

  it('não toca activity_results, activity_traces nem XP — a tentativa antiga é história do professor', async () => {
    progressRows = [{ activity_id: 'concept-1', status: 'completed' }];
    await reopenLessonProgress(LESSON);
    expect(new Set(touched)).toEqual(new Set(['progress']));
  });

  it('falha do UPDATE reporta vazio — o chamador nunca celebra um reset que não desceu', async () => {
    progressRows = [{ activity_id: 'concept-1', status: 'completed' }];
    updateError = { message: 'permission denied for table progress' };
    await expect(reopenLessonProgress(LESSON)).resolves.toEqual([]);
  });

  it('falha da LEITURA não vira escrita às cegas', async () => {
    selectError = { message: 'network' };
    await expect(reopenLessonProgress(LESSON)).resolves.toEqual([]);
    expect(updates).toHaveLength(0);
  });
});
