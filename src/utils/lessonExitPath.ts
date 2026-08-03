/**
 * Destino do X da lição. Era `navigate(-1)`: quem abre a aula por link direto
 * não tem página anterior no histórico e o botão virava um no-op — o aluno
 * ficava preso na lição. Um destino explícito sai sempre.
 */
export function lessonExitPath(programSlug?: string | null): string {
  const slug = programSlug?.trim();
  return slug ? `/program/${encodeURIComponent(slug)}` : '/';
}
