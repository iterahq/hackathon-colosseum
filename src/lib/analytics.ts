// Injetado em runtime, e não no `index.html`, porque a tag é condicional: sem
// website id nenhuma tag é emitida. Uma tag apontando pra um id inexistente
// daria 404 a cada pageview e a falsa impressão de que o app está medido.
// O id não é segredo — aparece no HTML de todo site medido; quem autoriza a
// escrita é o servidor do Umami, pela origem.
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
