/**
 * Qual LADO da aula ao vivo um admin escolheu ao entrar (`/live/:sessionId`).
 *
 * Um tenant_admin/owner é staff E aluno ao mesmo tempo: o link da aula não diz
 * qual dos dois ele quer ser hoje. Esta camada guarda a escolha por sessão.
 *
 * A escolha mora em MEMÓRIA (morre no reload/nova aba) de propósito: é uma
 * decisão de ENTRADA, não uma preferência de perfil. Persistir em
 * localStorage prenderia o admin no papel escolhido na primeira vez que ele
 * abriu aquela aula — trocar de papel é exatamente sair e entrar de novo.
 */
export type LiveEntryRole = 'learner' | 'instructor';

const chosen = new Map<string, LiveEntryRole>();

export function readLiveEntryRole(sessionId: string | null | undefined): LiveEntryRole | null {
  if (!sessionId) return null;
  return chosen.get(sessionId) ?? null;
}

export function writeLiveEntryRole(sessionId: string, role: LiveEntryRole): void {
  chosen.set(sessionId, role);
}

export function clearLiveEntryRole(sessionId?: string): void {
  if (sessionId) chosen.delete(sessionId);
  else chosen.clear();
}

/** A rota que serve cada lado da MESMA sessão. */
export function liveEntryPath(sessionId: string, role: LiveEntryRole): string {
  return role === 'instructor' ? `/live/instructor/${sessionId}` : `/live/${sessionId}`;
}

/**
 * Perguntar o papel só faz sentido para quem tem os dois lados disponíveis e
 * ainda não escolheu nesta entrada. Aluno e instrutor sem cargo de admin caem
 * direto na aula, como sempre.
 */
export function shouldAskLiveEntryRole(input: {
  isAdmin: boolean;
  chosenRole: LiveEntryRole | null;
}): boolean {
  return input.isAdmin && input.chosenRole === null;
}
