/** Text by language. Declared here so the browser can import this module without the server's awarding code. */
type I18nText = Record<string, string>;

export interface CapabilityClaim {
  /** Stable id, written on chain as `claim:<id>`. Never rename one that was minted. */
  id: string;
  /** The unit's ordinal inside the program. */
  trail: number;
  /** 1-based position of the lesson inside its trail: the day that proves the claim. */
  day: number;
  title: I18nText;
  /** Claims that must be proven first. Always an earlier day. */
  requires: string[];
}

export interface CapabilityGraph {
  program: string;
  version: number;
  /** Trail titles by trail ordinal: what a reader sees before anything is fetched. */
  trails: I18nText[];
  claims: CapabilityClaim[];
}

const claim = (id: string, trail: number, day: number, en: string, pt: string, requires: string[] = []): CapabilityClaim => ({
  id,
  trail,
  day,
  title: { en, pt },
  requires,
});

/** "Web do Zero": what each of the 15 days proves, authored from the published lessons. */
export const ITERA_V2_GRAPH: CapabilityGraph = {
  program: 'itera-v2',
  version: 1,
  trails: [
    { en: 'Week 1 · HTML', pt: 'Semana 1 · HTML' },
    { en: 'Week 2 · CSS', pt: 'Semana 2 · CSS' },
    { en: 'Week 3 · JavaScript', pt: 'Semana 3 · JavaScript' },
  ],
  claims: [
    claim('html-tags', 0, 1, 'Reads HTML and tells the tags from the content', 'Lê HTML e separa as tags do conteúdo'),
    claim('html-skeleton', 0, 1, 'Writes a valid page skeleton from scratch', 'Escreve do zero o esqueleto válido de uma página', ['html-tags']),
    claim('html-nesting', 0, 2, 'Nests tags correctly: lists, emphasis and images', 'Encaixa tag dentro de tag: listas, destaque e imagens', ['html-skeleton']),
    claim('html-attrs', 0, 2, 'Builds links and images with attributes', 'Monta links e imagens com atributos', ['html-tags']),
    claim('html-semantic', 0, 3, 'Structures a page in semantic parts', 'Organiza a página em partes semânticas', ['html-nesting']),
    claim('html-anchors', 0, 3, 'Builds a menu that jumps to named sections', 'Monta um menu que pula para seções com nome', ['html-attrs', 'html-semantic']),
    claim('html-table', 0, 4, 'Represents data in a table', 'Representa dados em uma tabela', ['html-nesting']),
    claim('html-form', 0, 4, 'Builds a form with labeled, typed inputs', 'Monta um formulário com campos rotulados e tipados', ['html-attrs']),
    claim('html-a11y', 0, 5, 'Makes a page accessible and findable', 'Deixa a página acessível e encontrável', ['html-attrs', 'html-skeleton']),
    claim('html-publish', 0, 5, 'Ships a complete semantic HTML page', 'Entrega uma página HTML semântica completa', ['html-semantic', 'html-table', 'html-form']),

    claim('css-rules', 1, 1, 'Links a stylesheet and writes CSS rules', 'Liga uma folha de estilo e escreve regras CSS', ['html-skeleton']),
    claim('css-selectors', 1, 1, 'Targets elements with tag and class selectors', 'Mira elementos com seletores de tag e de classe', ['css-rules', 'html-attrs']),
    claim('css-box', 1, 2, 'Controls space with padding, border and margin', 'Controla o espaço com padding, borda e margem', ['css-rules']),
    claim('css-sizing', 1, 2, "Predicts an element's real size", 'Prevê o tamanho real de um elemento', ['css-box']),
    claim('css-flex-row', 1, 3, 'Lays a menu in a row with flexbox', 'Deita um menu em fila com flexbox', ['css-selectors', 'html-anchors']),
    claim('css-flex-align', 1, 3, 'Aligns items on both flex axes', 'Alinha itens nos dois eixos do flex', ['css-flex-row']),
    claim('css-flex-wrap', 1, 4, 'Builds cards that wrap to the next line', 'Monta cards que quebram para a linha de baixo', ['css-flex-row', 'css-box']),
    claim('css-cascade', 1, 4, 'Predicts which CSS rule wins', 'Prevê qual regra CSS vence', ['css-selectors']),
    claim('css-responsive', 1, 5, 'Adapts a page to the phone with media queries', 'Adapta a página ao celular com media queries', ['css-flex-wrap', 'css-cascade', 'html-a11y']),

    claim('js-console', 2, 1, 'Links a script and reads the console', 'Liga um script e lê o console', ['html-skeleton']),
    claim('js-variables', 2, 1, 'Stores values in variables and joins text', 'Guarda valores em variáveis e junta textos', ['js-console']),
    claim('js-conditions', 2, 2, 'Makes code decide with comparisons and if/else', 'Faz o código decidir com comparações e if/else', ['js-variables']),
    claim('js-functions', 2, 3, 'Writes functions with parameters and return', 'Escreve funções com parâmetro e return', ['js-variables']),
    claim('js-dom-write', 2, 3, 'Finds an element and writes on the page', 'Encontra um elemento e escreve na página', ['js-functions', 'css-selectors']),
    claim('js-events', 2, 4, 'Reacts to a click with an event listener', 'Reage ao clique com um event listener', ['js-dom-write', 'css-cascade']),
    claim('js-dom-create', 2, 4, 'Creates page elements safely from JavaScript', 'Cria elementos na página com segurança pelo JavaScript', ['js-dom-write']),
    claim('js-forms', 2, 5, 'Handles a form submit and reads what was typed', 'Trata o envio de um formulário e lê o que foi digitado', ['js-events', 'html-form']),
    claim('js-app', 2, 5, 'Ships a working interactive page', 'Entrega uma página interativa que funciona', ['js-forms', 'js-dom-create', 'js-conditions', 'css-responsive']),
  ],
};

const GRAPHS: Record<string, CapabilityGraph> = { [ITERA_V2_GRAPH.program]: ITERA_V2_GRAPH };

export function graphOf(programSlug: unknown): CapabilityGraph | null {
  return typeof programSlug === 'string' ? (GRAPHS[programSlug] ?? null) : null;
}

/** The claims one stamped day proves. */
export function claimsOfDay(graph: CapabilityGraph, trail: number, day: number): CapabilityClaim[] {
  return graph.claims.filter((entry) => entry.trail === trail && entry.day === day);
}

/** The first claim not yet proven whose prerequisites all are: what to prove next. */
export function nextClaim(graph: CapabilityGraph, proven: ReadonlySet<string>): CapabilityClaim | null {
  return graph.claims.find((entry) => !proven.has(entry.id) && entry.requires.every((id) => proven.has(id))) ?? graph.claims.find((entry) => !proven.has(entry.id)) ?? null;
}
