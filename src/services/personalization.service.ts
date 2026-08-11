/**
 * O elenco do aluno (`itera.learner_personalization`) — camada de dados.
 *
 * Uma linha por aluno, RLS estritamente do próprio dono (migration 0060). Guarda
 * nome/profissão/idade de gente da família, então nada aqui vaza pra instrutor
 * ou admin de propósito.
 *
 * Padrão do projeto: componente → hook (useQuery) → service → Supabase. Sem React.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { getIteraUserId } from '@/services/iteraUser';
import type { PersonalizationValues } from '@/types/personalization';
import {
  DISMISSED_KEY,
  PERSONALIZATION_FIELDS,
  sanitizePersonalizationValue,
} from '@/utils/personalization';

const FIELD_KIND = new Map(PERSONALIZATION_FIELDS.map((f) => [f.id, f.kind]));

/**
 * Só campos do vocabulário, já saneados. O saneamento roda de novo AQUI (e não
 * só no formulário) porque este service também é a porta por onde um valor
 * restaurado do banco volta pra tela: linha gravada por um build antigo, ou por
 * um cliente que não é este, não pode reintroduzir marcação no enunciado.
 */
function coerce(raw: unknown): PersonalizationValues {
  if (!raw || typeof raw !== 'object') return {};
  const out: PersonalizationValues = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (id === DISMISSED_KEY) {
      if (value === '1') out[id] = '1';
      continue;
    }
    const kind = FIELD_KIND.get(id);
    if (!kind || typeof value !== 'string') continue;
    const clean = sanitizePersonalizationValue(value, kind);
    if (clean) out[id] = clean;
  }
  return out;
}

/**
 * O elenco do aluno. Objeto vazio quando não há linha, não configurado ou
 * deslogado.
 *
 * ⚠️ Leitura que FALHA lança, em vez de devolver `{}`. Ler-como-vazio faria a
 * query virar `isSuccess` com elenco vazio, o gate perguntaria de novo, e o
 * `save` seguinte — que grava o jsonb INTEIRO — apagaria os campos que o aluno
 * já tinha gravado. Erro propagado deixa `ready`/`mayAsk` falsos: o texto cai
 * no fallback e nada é sobrescrito.
 */
export async function getMyPersonalization(): Promise<PersonalizationValues> {
  if (!isSupabaseConfigured) return {};
  const iteraUserId = await getIteraUserId();
  if (!iteraUserId) return {};
  const { data, error } = await getSupabase()
    .from('learner_personalization')
    .select('values')
    .eq('user_id', iteraUserId)
    .maybeSingle();
  if (error) throw error;
  return coerce((data as { values?: unknown } | null)?.values);
}

/**
 * Grava o elenco inteiro (upsert por `user_id`). Devolve o que ficou valendo, já
 * saneado — quem chamou renderiza ISSO, não o que digitou, pra tela e banco
 * nunca discordarem.
 */
export async function saveMyPersonalization(
  values: PersonalizationValues
): Promise<PersonalizationValues | null> {
  if (!isSupabaseConfigured) return null;
  const iteraUserId = await getIteraUserId();
  if (!iteraUserId) return null;
  const clean = coerce(values);
  const { error } = await getSupabase()
    .from('learner_personalization')
    .upsert(
      { user_id: iteraUserId, values: clean, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  return error ? null : clean;
}
