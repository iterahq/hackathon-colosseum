/**
 * O lado do BANCO do "resetar a lição para todos".
 *
 * `clearLearnerLessonState` (liveLessonReset.ts) alcança os três depósitos de
 * localStorage, e o corte por instante alcança `class_answers`. Nenhum dos dois
 * alcança `itera.progress` — e é lá que mora o "concluído" dos kinds que não
 * produzem resposta (`concept`, `concept_reveal`, `diagram`, `video`,
 * `document` em modo leitura): o aluno os fecha e a linha vai direto pro banco
 * com status `completed`. Depois do reset a lição reabria com essas atividades
 * já marcadas, que é o "não dá pra refazer" que o reset existe pra resolver.
 *
 * ⚠️ POR QUE REABRIR EM `in_progress` E NÃO APAGAR A LINHA. Apagar diria que o
 * aluno nunca chegou na atividade, o que é falso e não é recuperável. `resume`
 * (`resumeIndexFor`) só pergunta se a linha é `completed`, então rebaixar já
 * devolve a atividade pro aluno, preservando o fato de que ele passou por ela.
 * `activity_results` e `activity_traces` seguem intactos: o histórico da
 * tentativa antiga é do professor, e o reset nunca foi sobre apagar histórico.
 *
 * ⚠️ SÓ O QUE ESTAVA `completed` É TOCADO. Escrever nas outras criaria linha
 * para atividade que o aluno nunca abriu — a turma quase nunca chega no fim da
 * lição durante a aula, e uma lição de 20 atividades viraria 20 linhas dizendo
 * que ele alcançou todas.
 */
import type { ProgressStatus } from '@/services/progress.service';

/**
 * Para onde uma atividade concluída volta. NÃO é `'done'`/`'todo'` da UI
 * (`src/types/content.ts`) — é o enum `itera.progress_status`, cujos valores
 * são `not_started` · `in_progress` · `completed`.
 */
export const REOPENED_PROGRESS_STATUS: ProgressStatus = 'in_progress';

/**
 * Quais atividades da lição precisam voltar a ficar disponíveis, na ordem em
 * que a lição as apresenta. Ids repetidos entram uma vez só: a lista vira um
 * `.in()` e um id duplicado só encarece a query.
 */
export function activitiesToReopen(
  activityIds: readonly string[],
  statuses: Readonly<Record<string, ProgressStatus>>
): string[] {
  const seen = new Set<string>();
  const reopen: string[] = [];
  for (const id of activityIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (statuses[id] === 'completed') reopen.push(id);
  }
  return reopen;
}
