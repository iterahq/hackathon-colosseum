/**
 * A ação do professor que precisa de banco: remoção da sala (migration 0029).
 * As outras do menu "⋯" — palco, abaixar a mão e tirar do palco — são broadcast
 * e não passam por aqui.
 *
 * Por que banco e não broadcast: broadcast é auto-atestado (o emissor nunca é
 * comparado ao `user_id` do payload), então remoção por broadcast seria
 * auto-remoção de devtools. Aqui a RLS de `class_removals` exige staff da aula E
 * força `removed_by` a ser o próprio chamador.
 *
 * Padrão do projeto: componente → hook (useQuery) → service → Supabase. No React.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { getIteraUserId } from '@/services/iteraUser';

type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

/**
 * O aluno lê a PRÓPRIA linha (policy `class_removals_select`) para saber que foi
 * removido. Sem isso a tela dele ficaria num spinner de reconexão eterno, já que
 * `can_access_class_topic` passa a negar o JOIN no canal.
 */
export async function amIRemovedFrom(sessionId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !sessionId) return false;
  const me = await getIteraUserId();
  if (!me) return false;
  const { data, error } = await getSupabase()
    .from('class_removals')
    .select('user_id')
    .eq('session_id', sessionId)
    .eq('user_id', me);
  if (error) return false;
  return asRows(data).length > 0;
}

export async function removeFromClass(sessionId: string, userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const removedBy = await getIteraUserId();
  if (!removedBy) throw new Error('itera user not resolvable');
  const { error } = await getSupabase()
    .from('class_removals')
    .insert({ session_id: sessionId, user_id: userId, removed_by: removedBy });
  if (error) throw new Error(error.message);
}
