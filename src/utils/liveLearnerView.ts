/**
 * O professor pedindo o lado do ALUNO da própria aula (`/live/:id?como=aluno`).
 *
 * Duas telas leem o mesmo parâmetro — o link que o abre e a página que o honra —
 * então ele mora aqui: renomear em um lugar só mataria a escolha em silêncio.
 * Só rebaixa quem é staff; pro aluno o parâmetro não faz nada.
 */
const PARAM = 'como';
const VALUE = 'aluno';

export const liveLearnerHref = (sessionId: string) => `/live/${sessionId}?${PARAM}=${VALUE}`;

export const wantsLearnerView = (params: URLSearchParams) => params.get(PARAM) === VALUE;
