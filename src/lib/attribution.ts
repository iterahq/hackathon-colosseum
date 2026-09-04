/**
 * First-touch marketing attribution, captured on arrival.
 *
 * Both auth paths return the learner to `window.location.origin + '/'`
 * (AuthContext `signInWithOAuth`, otpAuth `emailRedirectTo`), so the `?utm_*`
 * that brought them is gone by the time they have an account. Reading it at
 * conversion time is impossible by construction — it has to be read on the very
 * first page view and carried forward.
 *
 * FIRST touch wins, not last: someone can see an ad today and subscribe four
 * months later, and the credit belongs to the campaign that brought them.
 */

import { UTM_KEYS } from '@/types/attribution';
import type { Attribution, UtmKey } from '@/types/attribution';
import { sanitizeValue, safeHost } from './attributionSanitize';
import { readAttribution, writeAttribution } from './attributionStore';

export type { Attribution } from '@/types/attribution';
export { readAttribution, clearAttribution } from './attributionStore';
export { sanitizeValue } from './attributionSanitize';

/**
 * Voltar de um login NÃO é uma origem de marketing.
 *
 * Sem isto, quem chega direto no app e entra com o Google fica atribuído a
 * `accounts.google.com`: o provedor de identidade apareceria como canal de
 * aquisição no relatório — exatamente o número que este código existe pra medir.
 */
const IDP_HOSTS = [
  'accounts.google.com',
  'login.microsoftonline.com',
  'appleid.apple.com',
];

/**
 * A volta do OAuth/magic-link também chega com os parâmetros da sessão na URL
 * (ou no fragmento). Cobre provedor fora da lista acima e o caso em que o
 * navegador não manda referrer nenhum.
 */
function isAuthCallback(url: URL): boolean {
  const hasParam = (key: string) => url.searchParams.has(key) || url.hash.includes(`${key}=`);
  return hasParam('access_token') || hasParam('code') || hasParam('error_description');
}

/** Reads a fresh attribution from a URL + referrer without touching storage. */
export function readFromLocation(href: string, referrer: string | null): Attribution | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const utm: Partial<Record<UtmKey, string>> = {};
  for (const key of UTM_KEYS) {
    const value = sanitizeValue(url.searchParams.get(key));
    if (value) utm[key] = value;
  }

  // O callback de auth só invalida o REFERRER. Um `utm_*` explícito na URL foi
  // posto por quem montou a campanha, e um link de campanha pode carregar
  // `code=` de cupom — descartar a captura inteira por causa dele perderia a
  // origem real que este código existe pra medir.
  const referrerHost = isAuthCallback(url) ? null : safeHost(referrer);
  const isInternal = referrerHost === url.hostname;
  const isIdp = referrerHost !== null && IDP_HOSTS.includes(referrerHost);
  const externalReferrer = referrerHost && !isInternal && !isIdp ? referrerHost : null;

  // Navegação interna não é origem; sem UTM e sem referrer externo não há nada
  // a atribuir, e não guardar aqui evita que um primeiro toque vazio sombreie
  // uma origem real que chegue depois.
  if (Object.keys(utm).length === 0 && !externalReferrer) return null;

  return {
    utm,
    referrer: externalReferrer,
    landing: url.pathname.slice(0, 128),
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Capture the origin if this is the first touch. Idempotent and safe to call on
 * every boot: an existing record is never overwritten.
 */
export function captureAttribution(href: string, referrer: string | null): Attribution | null {
  const existing = readAttribution();
  if (existing) return existing;

  const fresh = readFromLocation(href, referrer);
  if (!fresh) return null;

  writeAttribution(fresh);
  return fresh;
}

/**
 * Flat string map for Stripe Checkout metadata, which accepts only string
 * values. Empty when there is nothing attributed, so the caller can omit the
 * field entirely instead of sending noise.
 */
export function attributionMetadata(a: Attribution | null): Record<string, string> {
  if (!a) return {};
  const meta: Record<string, string> = {};
  for (const [key, value] of Object.entries(a.utm)) {
    if (value) meta[key] = value;
  }
  if (a.referrer) meta.referrer = a.referrer;
  if (a.landing) meta.landing = a.landing;
  if (a.capturedAt) meta.captured_at = a.capturedAt;
  return meta;
}
