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
