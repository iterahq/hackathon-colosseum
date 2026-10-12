/** Two or three words per claim, for a badge. The full sentence of the claim stays in the capability graph. */
const SHORT: Record<string, { en: string; pt: string }> = {
  'html-tags': { en: 'Tags', pt: 'Tags' },
  'html-skeleton': { en: 'Page skeleton', pt: 'Esqueleto' },
  'html-nesting': { en: 'Nesting', pt: 'Aninhamento' },
  'html-attrs': { en: 'Attributes', pt: 'Atributos' },
  'html-semantic': { en: 'Semantics', pt: 'Semântica' },
  'html-anchors': { en: 'Anchor menu', pt: 'Menu âncora' },
  'html-table': { en: 'Tables', pt: 'Tabelas' },
  'html-form': { en: 'Forms', pt: 'Formulários' },
  'html-a11y': { en: 'Accessibility', pt: 'Acessibilidade' },
  'html-publish': { en: 'Full page', pt: 'Página completa' },
  'css-rules': { en: 'CSS rules', pt: 'Regras CSS' },
  'css-selectors': { en: 'Selectors', pt: 'Seletores' },
  'css-box': { en: 'Box model', pt: 'Box model' },
  'css-sizing': { en: 'Sizing', pt: 'Tamanhos' },
  'css-flex-row': { en: 'Flex row', pt: 'Flex em fila' },
  'css-flex-align': { en: 'Flex align', pt: 'Alinhar flex' },
  'css-flex-wrap': { en: 'Flex wrap', pt: 'Flex wrap' },
  'css-cascade': { en: 'Cascade', pt: 'Cascata' },
  'css-responsive': { en: 'Responsive', pt: 'Responsivo' },
  'js-console': { en: 'Console', pt: 'Console' },
  'js-variables': { en: 'Variables', pt: 'Variáveis' },
  'js-conditions': { en: 'Conditions', pt: 'Condições' },
  'js-functions': { en: 'Functions', pt: 'Funções' },
  'js-dom-write': { en: 'DOM write', pt: 'Escrever no DOM' },
  'js-events': { en: 'Events', pt: 'Eventos' },
  'js-dom-create': { en: 'DOM create', pt: 'Criar no DOM' },
  'js-forms': { en: 'Form submit', pt: 'Envio de form' },
  'js-app': { en: 'Interactive app', pt: 'App interativo' },
};

/** The short badge label of a claim in a locale; the `fallback` (the claim's own title) for an id with no short label. */
export function skillShortTitle(claimId: string, locale: string, fallback: string): string {
  const entry = SHORT[claimId];
  if (!entry) return fallback;
  return locale === 'pt' ? entry.pt : entry.en;
}

export const SHORT_TITLE_IDS: readonly string[] = Object.keys(SHORT);
