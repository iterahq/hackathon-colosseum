/**
 * As duas ações do professor que precisam de banco: estrela e remoção da sala
 * (migration 0029). As outras três do menu "⋯" — palco, abaixar a mão e tirar
 * do palco — são broadcast e não passam por aqui.
 *
 * Por que banco e não broadcast: broadcast é auto-atestado (o emissor nunca é
 * comparado ao `user_id` do payload), então estrela por broadcast seria
 * auto-estrela de devtools e o pódio viraria ficção. Aqui a RLS de `class_stars`
 * exige staff da aula E força `awarded_by` a ser o próprio chamador.
 *
 * Padrão do projeto: componente → hook (useQuery) → service → Supabase. No React.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { getIteraUserId } from '@/services/iteraUser';

type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Saldo de estrelas por aluno. `class_stars` é append-only (tirar uma estrela é
 * um delta -1), então o saldo é a soma crua. O piso em zero é do pódio
 * (rankByScore) — aplicá-lo aqui faria a soma do banco divergir da que o
 * broadcast mantém no cliente.
 */
export async function getSessionStars(sessionId: string): Promise<Record<string, number>> {
  if (!isSupabaseConfigured || !sessionId) return {};
  const { data, error } = await getSupabase()
    .from('class_stars')
    .select('user_id, delta')
    .eq('session_id', sessionId);
  if (error) throw new Error(error.message);

  const totals: Record<string, number> = {};
  for (const row of asRows(data)) {
    const userId = str(row.user_id);
    if (!userId) continue;
    totals[userId] = (totals[userId] ?? 0) + (typeof row.delta === 'number' ? row.delta : 0);
  }
  return totals;
}

export async function awardStar(
  sessionId: string,
  userId: string,
  delta: 1 | -1
): Promise<void> {
  if (!isSupabaseConfigured) return;
  // `awarded_by` é FK para itera.users, não para o auth uid — e a RLS compara
  // com itera.current_itera_user_id(), então mandar o auth uid falha calado.
  const awardedBy = await getIteraUserId();
  if (!awardedBy) throw new Error('itera user not resolvable');
  const { error } = await getSupabase()
    .from('class_stars')
    .insert({ session_id: sessionId, user_id: userId, delta, awarded_by: awardedBy });
  if (error) throw new Error(error.message);
}

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
