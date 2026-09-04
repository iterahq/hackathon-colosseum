/**
 * Saneamento da origem, na borda.
 *
 * `utm_source` é entrada de usuário: qualquer um manda um link com o valor que
 * quiser, e esse valor é guardado, enviado pra Stripe e depois exibido num
 * painel. Por isso é restringido aqui, uma vez, em vez de confiar e escapar em
 * cada um desses pontos.
 */

export const MAX_VALUE = 64;

/**
 * Valor fora do conjunto permitido é descartado INTEIRO. Truncar até ficar
 * válido guardaria um valor que mente sobre a origem — pior que não guardar.
 */
export function sanitizeValue(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_VALUE) return null;
  return /^[A-Za-z0-9._\-+ ]+$/.test(trimmed) ? trimmed : null;
}

/** Só o HOST do referrer — a URL inteira pode carregar query string de terceiro. */
export function safeHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname;
    return host.length <= MAX_VALUE ? host : null;
  } catch {
    return null;
  }
}
