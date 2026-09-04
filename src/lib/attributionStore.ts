import { UTM_KEYS } from '@/types/attribution';
import type { Attribution, UtmKey } from '@/types/attribution';
import { sanitizeValue } from './attributionSanitize';

/**
 * Onde o primeiro toque fica guardado — separado de como ele é lido da URL.
 *
 * A chave NÃO usa o prefixo `itera.` que `clearIteraStorage()` apaga no
 * sign-out: sair da conta é evento normal dentro da janela de atribuição, e
 * perder a origem ali derrubaria em silêncio justamente as conversões que
 * queremos medir.
 */
const STORAGE_KEY = 'itera_attribution';

/**
 * Depois disto o primeiro toque deixa de valer e um novo pode ser capturado.
 * Sem janela, o `?utm_source=` do primeiro aluno de um laboratório da Educar+
 * seria creditado por todo assinante que usasse aquela máquina depois — para
 * sempre, porque a chave sobrevive de propósito ao sign-out.
 */
const WINDOW_DAYS = 90;

function withinWindow(capturedAt: unknown): boolean {
  if (typeof capturedAt !== 'string') return false;
  const at = Date.parse(capturedAt);
  if (Number.isNaN(at)) return false;
  const age = Date.now() - at;
  return age >= 0 && age <= WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Safari privado e webview embutida lançam no ACESSO, não no uso.
    return null;
  }
}

export function readAttribution(): Attribution | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Attribution;
    if (!withinWindow(parsed?.capturedAt)) return null;
    // Re-saneia na SAÍDA também: localStorage é gravável por qualquer coisa que
    // já rodou nesta origem, então o que lemos não é necessariamente o que
    // escrevemos.
    const utm: Partial<Record<UtmKey, string>> = {};
    for (const key of UTM_KEYS) {
      const value = sanitizeValue(parsed?.utm?.[key]);
      if (value) utm[key] = value;
    }
    const referrer = sanitizeValue(parsed?.referrer) ?? null;
    // Registro que não sobrou nada do saneamento é ausência, não primeiro
    // toque: devolvê-lo faria `captureAttribution` ver um valor e nunca mais
    // capturar, sombreando pra sempre a origem real que chegasse depois.
    if (Object.keys(utm).length === 0 && !referrer) return null;
    return {
      utm,
      referrer,
      landing: typeof parsed?.landing === 'string' ? parsed.landing.slice(0, 128) : null,
      capturedAt: parsed.capturedAt,
    };
  } catch {
    return null;
  }
}

export function writeAttribution(value: Attribution): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Cota estourada ou navegador travado: atribuição é telemetria best-effort
    // e não pode quebrar a página que ela estava medindo.
  }
}

/** Test seam — apaga o primeiro toque guardado. */
export function clearAttribution(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* nada pra limpar */
  }
}
