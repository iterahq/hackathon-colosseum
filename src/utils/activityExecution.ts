/**
 * QUAL execução da lição o aluno está fazendo agora.
 *
 * Da call de 06/08 — Samuel relatou "respostas ficarem salvas se for refazer" e o
 * Tainan respondeu: *"acho que tinha q deixar salvo no banco mas na activity,
 * outra execucao nascer limpa"*. Rascunho é do aluno E da execução: dentro da
 * mesma aula um refresh tem que devolver o trabalho; numa aula NOVA a mesma
 * atividade tem que nascer no starter, e não com o código da turma anterior.
 *
 * ## Por que a URL, e não um estado que alguém seta
 *
 * O rascunho é lido no PRIMEIRO render da atividade, antes de qualquer efeito da
 * página rodar. Um "setExecution()" em `useEffect` chegaria tarde justamente na
 * montagem que importa — o aluno veria o código velho por um frame, que é
 * exatamente o bug. A URL, ao contrário, já está correta antes de qualquer
 * componente montar, e "qual execução é esta" É a URL: `/live/:sessionId` é uma
 * aula, `/g/:code` é o link de convidado da mesma aula, e o resto não é execução
 * ao vivo nenhuma.
 *
 * `null` (self-paced, autoria, harness) é uma execução também — a do aluno
 * sozinho. Duas visitas ao `/lesson/:id` são a MESMA, então lá o rascunho
 * continua voltando como sempre voltou.
 */

/** A execução codificada num caminho, ou `null` para self-paced/autoria. */
export function executionFromPath(pathname: string): string | null {
  const live = /^\/live\/([^/?#]+)/.exec(pathname);
  if (live) return `live:${decodeURIComponent(live[1])}`;
  // O convidado entra pelo código curto e nunca vê o id da sessão. Prefixo
  // próprio para nunca colidir com um sessionId que por acaso seja igual.
  const guest = /^\/g\/([^/?#]+)/.exec(pathname);
  if (guest) return `guest:${decodeURIComponent(guest[1])}`;
  return null;
}

export function currentExecutionId(): string | null {
  if (typeof window === 'undefined') return null;
  return executionFromPath(window.location.pathname);
}

/**
 * O rascunho gravado pertence a esta execução?
 *
 * `undefined` = gravado antes desta regra existir, e aí ele PASSA. Tratar o
 * legado como "de outra execução" apagaria da tela o trabalho de todo mundo que
 * está com uma aula aberta no momento do deploy — o preço de um dado que nunca
 * mentiu, só não estava etiquetado.
 */
export function belongsToExecution(
  stamped: string | null | undefined,
  current: string | null
): boolean {
  if (stamped === undefined) return true;
  return stamped === current;
}
