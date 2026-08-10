/**
 * O placar que o professor entrega a quem PEDE.
 *
 * Defeito medido na aula de 06/08: *"eu como aluno vi somente eu no pódio e o
 * professor viu eu e o tainan"*. A causa é que o placar de cada cliente é
 * construído só do que ele OUVIU: o broadcast `answered` chega em quem está
 * conectado na hora, e não existe assinatura de `postgres_changes` em
 * `itera.class_answers` em lugar nenhum do app. Então quem entra atrasado,
 * recarrega a aba ou perde a rede por dez segundos fica com um pódio de uma
 * pessoa. O professor, que ficou conectado desde o começo, vê a turma inteira e
 * não tem como perceber que ninguém mais vê aquilo.
 *
 * É PEDIDO E RESPOSTA, não anúncio na entrada de alguém. A primeira versão
 * reanunciava quando uma chave nova de presença entrava, e ela não fechava o
 * defeito: a chave de presença é o `userId`, então o aluno que RECARREGA volta
 * enquanto o servidor ainda segura a presença fantasma dele — o `join` chega com
 * `currentPresences` não-vazio e o reanúncio não sai. Justo o caso relatado.
 * Quem sabe que está sem placar é quem acabou de conectar, então é ele que pede.
 *
 * A resposta sai do BANCO (`class_answers`), nunca do placar que o professor
 * ouviu. O `answered` é auto-atestado no tópico compartilhado — um aluno pode
 * forjar um acerto no nome de outro. Isso já era verdade antes disto, e o
 * professor vê o resultado; o que não pode acontecer é a resposta dele carimbar
 * essa mentira com a autoridade do tópico de staff e espalhá-la pra quem estava
 * offline, de forma irreversível (o `recordAnswer` é monótono).
 *
 * O `SCOREBOARD_EVENT` anda no tópico de STAFF (`class:<id>:ctrl`, migration
 * 0023): diferente do `answered`, ele fala pelos OUTROS, então no tópico
 * compartilhado um aluno reescreveria o pódio da turma. O pedido anda no tópico
 * compartilhado — é onde o aluno pode enviar — e não carrega nada além da
 * intenção de receber.
 *
 * Não é uma leitura durável do lado do aluno de propósito: dar `select` de
 * `class_answers` dos colegas a um aluno é ampliar RLS pra resolver um problema
 * de UI, e o pódio já é público na tela da turma.
 *
 * Padrão do projeto: módulo puro, sem React.
 */
import type { ScoreboardEntry } from '@/types/liveClass';

export type { ScoreboardEntry } from '@/types/liveClass';

/**
 * Teto de entradas por resposta. Uma turma de 30 numa aula de 20 atividades dá
 * 600 entradas (~40 KB), bem abaixo do limite de payload do Realtime — o teto
 * existe pro caso patológico, e cortar é melhor que a resposta ser recusada
 * inteira e o recém-chegado ficar sem placar nenhum.
 */
export const SCOREBOARD_MAX_ENTRIES = 2000;

/**
 * Janela em que vários pedidos viram UMA resposta. Depois de uma queda de rede
 * a turma toda reconecta junto: sem isso são 30 leituras do banco e 30
 * broadcasts pra entregar o mesmo placar, quando uma resposta no tópico já
 * chega em todos.
 */
export const SCOREBOARD_REPLY_DEBOUNCE_MS = 400;

/**
 * Piso entre duas respostas. O pedido é uma mensagem que qualquer participante
 * pode repetir à vontade, e a resposta é grande e vai no tópico que carrega
 * `advance` / `timer` / `stage-show` — sem piso, um cliente em loop competiria
 * com os eventos que a aula de verdade não pode perder. Cinco segundos é
 * imperceptível pra quem acabou de entrar e fecha o laço.
 */
export const SCOREBOARD_REPLY_MIN_GAP_MS = 5000;

/**
 * Lê o payload que chegou. Descarta entrada malformada em vez de rejeitar a
 * resposta inteira: uma chave estranha de um cliente de outra versão não pode
 * custar o placar de quem acabou de entrar.
 */
export function parseScoreboard(payload: unknown): ScoreboardEntry[] {
  const raw = (payload as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(raw)) return [];
  const out: ScoreboardEntry[] = [];
  for (const item of raw.slice(0, SCOREBOARD_MAX_ENTRIES)) {
    const e = item as Record<string, unknown> | null;
    if (typeof e?.activityId !== 'string' || typeof e.userId !== 'string') continue;
    if (!e.activityId || !e.userId) continue;
    const ms = e.elapsedMs;
    out.push({
      activityId: e.activityId,
      userId: e.userId,
      correct: e.correct === true,
      ...(typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 ? { elapsedMs: ms } : {}),
    });
  }
  return out;
}
