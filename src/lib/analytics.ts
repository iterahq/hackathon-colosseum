// Injetado em runtime, e não no `index.html`, porque a tag é condicional: sem
// website id nenhuma tag é emitida. Uma tag apontando pra um id inexistente
// daria 404 a cada pageview e a falsa impressão de que o app está medido.
// O id não é segredo — aparece no HTML de todo site medido; quem autoriza a
// escrita é o servidor do Umami, pela origem.
import { readAttribution } from './attributionStore';

const SRC = 'https://analytics.devfellowship.com/script.js';

export function mountUmami(doc: Document = document): boolean {
  const websiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID as string | undefined;
  if (!websiteId) return false;
  // Um segundo boot (HMR, remount) não pode dobrar pageview.
  if (doc.querySelector('script[data-website-id]')) return false;

  const script = doc.createElement('script');
  script.src = SRC;
  script.setAttribute('data-website-id', websiteId);
  doc.head.appendChild(script);
  return true;
}

interface UmamiTracker {
  identify?: (data: Record<string, string>) => void;
}

/**
 * Sets one session property on Umami through its own `identify` call. The tracker script loads
 * async, so when `window.umami` is not there yet the property goes out on the script's `load`.
 * Does nothing when no tracker tag was mounted (no website id): no call, no listener.
 */
export function setUmamiProperty(name: string, value: string, win: Window = window, doc: Document = document): boolean {
  const send = () => {
    const tracker = (win as Window & { umami?: UmamiTracker }).umami;
    if (typeof tracker?.identify !== 'function') return false;
    tracker.identify({ [name]: value });
    return true;
  };
  if (send()) return true;
  const script = doc.querySelector('script[data-website-id]');
  if (!script) return false;
  script.addEventListener('load', () => void send(), { once: true });
  return false;
}

/** The closed list of funnel steps, in the order a learner reaches them. */
export const FUNNEL_STEPS = [
  'signup_started',
  'signup_completed',
  'subscribe_clicked',
  'checkout_returned_success',
  'first_activity_opened',
  'first_lesson_completed',
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];

interface UmamiEventTracker {
  track?: (name: string, data?: Record<string, string>) => void;
}

/**
 * Sends one named funnel event to Umami, carrying only the stored first-touch campaign
 * (utm source, medium, campaign) so a step can be read per origin. Never carries an e-mail, a
 * user id or a name. No website id, no tracker yet or any failure: does nothing and never throws.
 */
export function trackFunnel(step: FunnelStep, win: Window = window): boolean {
  try {
    if (!import.meta.env.VITE_UMAMI_WEBSITE_ID) return false;
    const tracker = (win as Window & { umami?: UmamiEventTracker }).umami;
    if (typeof tracker?.track !== 'function') return false;
    const utm = readAttribution()?.utm ?? {};
    const data: Record<string, string> = {};
    if (utm.utm_source) data.utm_source = utm.utm_source;
    if (utm.utm_medium) data.utm_medium = utm.utm_medium;
    if (utm.utm_campaign) data.utm_campaign = utm.utm_campaign;
    tracker.track(step, data);
    return true;
  } catch {
    return false;
  }
}

/**
 * Same as `trackFunnel`, but once per browser. There is no cheap server fact for "first activity
 * opened" or "first lesson completed", so a `localStorage` flag (`funnel.itera.<step>`) stands in:
 * a cleared browser or a second device counts the learner again, which is acceptable for a funnel.
 * The flag is set only after the event was actually handed to the tracker.
 */
export function trackFunnelOnce(step: FunnelStep, win: Window = window): boolean {
  try {
    // Not `itera.`-prefixed on purpose: clearIteraStorage() wipes that prefix on sign-out and would count the person twice.
    const key = `funnel.itera.${step}`;
    if (win.localStorage.getItem(key)) return false;
    if (!trackFunnel(step, win)) return false;
    win.localStorage.setItem(key, '1');
    return true;
  } catch {
    return false;
  }
}
