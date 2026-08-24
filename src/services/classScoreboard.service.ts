/**
 * A leitura durável do placar DURANTE a aula.
 *
 * Mora fora do `classReport.service` de propósito: aquele é o relatório
 * pós-aula, e junta `users` / `class_guests` pra nomear cada participante. Este
 * roda num caminho que o aluno espera, com a turma na tela — só as colunas do
 * pódio, sem join nenhum.
 *
 * Padrão do projeto: componente/hook → service → fetch. No React.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { answerCountsAfterReset } from '@/utils/liveLessonReset';
import type { ScoreboardEntry } from '@/types/liveClass';

/**
 * Página de leitura. O PostgREST TRUNCA em `max-rows` sem erro, e uma turma de
 * 30 numa aula de 20 atividades já dá 600 linhas — perto o suficiente do teto
 * padrão pra que um placar truncado em silêncio devolvesse ao aluno exatamente o
 * pódio incompleto que estamos consertando.
 */
const PAGE = 500;

/**
 * O placar que já está no banco, pro professor responder a quem pede.
 *
 * **LANÇA** quando a leitura falha, em vez de devolver `[]`: ler nada e ler zero
 * respostas são fatos diferentes, e confundi-los faria o professor responder "a
 * turma não respondeu nada" — a mentira é pior que o silêncio.
 *
 * Chamado pelo PROFESSOR. Um aluno pode chamar sem risco — a RLS devolveria só a
 * linha dele —, mas seria uma query por aluno pra reaprender o que ele já sabe;
 * quem entrega o placar dos colegas a ele é a resposta do professor.
 * Ver `utils/liveScoreboard.ts`.
 *
 * `resetAt` é o instante de corte de "resetar a lição para todos": linha
 * anterior a ele é HISTÓRICO, não placar desta rodada. Este é o ÚNICO lugar onde
 * o corte encontra `class_answers` — o resto da agregação do professor (`answers`
 * em `useClassSession`) é memória, e é zerada junto quando o corte se move. Ver
 * `utils/liveLessonReset.ts` pra por que o reset não apaga linha.
 */
export async function getSessionScoreboard(
  sessionId: string,
  resetAt: string | null = null
): Promise<ScoreboardEntry[]> {
  if (!isSupabaseConfigured || !sessionId) return [];
  const sb = getSupabase();
  const out: ScoreboardEntry[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('class_answers')
      .select('activity_id, user_id, correct, elapsed_ms, created_at')
      .eq('session_id', sessionId)
      .order('activity_id', { ascending: true })
      .order('user_id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    for (const r of rows) {
      const activityId = typeof r.activity_id === 'string' ? r.activity_id : '';
      const userId = typeof r.user_id === 'string' ? r.user_id : '';
      if (!activityId || !userId) continue;
      const createdAt = typeof r.created_at === 'string' ? r.created_at : null;
      if (!answerCountsAfterReset(createdAt, resetAt)) continue;
      const ms = r.elapsed_ms;
      out.push({
        activityId,
        userId,
        correct: r.correct === true,
        ...(typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 ? { elapsedMs: ms } : {}),
      });
    }
    if (rows.length < PAGE) return out;
  }
}
